"""Auditoría encadenada: cadena por tenant, concurrencia, manipulación detectada y permisos."""

import logging
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from threading import Thread

import pytest

from evaluador.adapters.outbound.memory.audit_trail import ChainedAudit, InMemoryAuditTrail
from evaluador.application.use_cases.audit import ListAudit, VerifyAudit
from evaluador.domain.audit_trail import GENESIS, verify_chain
from evaluador.domain.errors import InvalidData, PermissionDenied
from evaluador.domain.identity import Role, User


class Tick:
    """Reloj que avanza un segundo por consulta: entradas con tiempos distintos y deterministas."""

    def __init__(self) -> None:
        self._t = datetime(2026, 1, 1, tzinfo=UTC)

    def now(self) -> datetime:
        self._t += timedelta(seconds=1)
        return self._t


def user(role: Role, tenant: str = "t1") -> User:
    return User(id=f"u-{role}", tenant_id=tenant, email=f"{role}@t.test", password_hash="x", role=role)


@pytest.fixture
def trail() -> InMemoryAuditTrail:
    return InMemoryAuditTrail()


@pytest.fixture
def audit(trail: InMemoryAuditTrail) -> ChainedAudit:
    return ChainedAudit(trail, Tick())


def fill(audit: ChainedAudit, n: int, tenant: str | None = "t1") -> None:
    for i in range(n):
        audit.register(tenant_id=tenant, actor="u1", action=f"action_{i}", detail=f"id-{i}")


# ---------------- cadena ----------------
def test_first_entry_links_to_genesis_and_next_to_previous(audit, trail):
    fill(audit, 3)
    a, b, c = trail.list_for("t1")
    assert (a.seq, b.seq, c.seq) == (1, 2, 3)
    assert a.prev_hash == GENESIS and b.prev_hash == a.hash and c.prev_hash == b.hash
    assert verify_chain([a, b, c]) is None


def test_each_tenant_has_its_own_chain(audit, trail):
    fill(audit, 2, "t1")
    fill(audit, 3, "t2")
    assert [e.seq for e in trail.list_for("t1")] == [1, 2]
    assert [e.seq for e in trail.list_for("t2")] == [1, 2, 3]
    assert trail.list_for("t2")[0].prev_hash == GENESIS


def test_entries_without_tenant_go_to_the_system_chain(audit, trail):
    audit.register(tenant_id=None, actor=None, action="startup", detail="")
    (e,) = trail.list_for("system")
    assert e.tenant_id == "system" and e.action == "startup" and trail.list_for("t1") == []


def test_detail_is_clipped_to_500_chars_before_hashing(audit, trail):
    audit.register(tenant_id="t1", actor="u1", action="x", detail="d" * 2000)
    (e,) = trail.list_for("t1")
    assert len(e.detail) <= 500 and verify_chain([e]) is None


def test_keeps_emitting_the_structured_log(audit, caplog):
    with caplog.at_level(logging.INFO, logger="evaluador.audit"):
        audit.register(tenant_id="t1", actor="u1", action="project_created", detail="p1")
    (rec,) = [r for r in caplog.records if r.name == "evaluador.audit"]
    assert rec.getMessage() == "project_created" and rec.audit is True and rec.tenant == "t1" and rec.actor == "u1"


def test_100_concurrent_threads_leave_an_intact_chain_without_repeated_seq(audit, trail):
    hilos = [Thread(target=fill, args=(audit, 1, "t1")) for _ in range(100)]
    [h.start() for h in hilos]
    [h.join() for h in hilos]
    entries = trail.list_for("t1")
    assert len(entries) == 100 and [e.seq for e in entries] == list(range(1, 101))
    assert verify_chain(entries) is None


# ---------------- consulta y verificación ----------------
def test_list_paginates_by_after_seq_and_limit(audit, trail):
    fill(audit, 10)
    page = ListAudit(trail).execute(user(Role.AUDITOR), after_seq=3, limit=4)
    assert [e.seq for e in page] == [4, 5, 6, 7]


def test_list_caps_limit_at_200_and_rejects_negative_after(audit, trail):
    fill(audit, 3)
    assert len(ListAudit(trail).execute(user(Role.AUDITOR), after_seq=0, limit=10_000)) == 3
    with pytest.raises(InvalidData):
        ListAudit(trail).execute(user(Role.AUDITOR), after_seq=-1, limit=10)
    with pytest.raises(InvalidData):
        ListAudit(trail).execute(user(Role.AUDITOR), after_seq=0, limit=0)


def test_list_only_returns_the_actors_tenant(audit, trail):
    fill(audit, 2, "t1")
    fill(audit, 5, "t2")
    assert len(ListAudit(trail).execute(user(Role.AUDITOR, "t1"), after_seq=0, limit=50)) == 2


def test_verify_reports_intact_chain(audit, trail):
    fill(audit, 5)
    r = VerifyAudit(trail).execute(user(Role.AUDITOR))
    assert (r.intact, r.first_invalid_seq, r.entries) == (True, None, 5)


def test_verify_on_empty_chain_is_intact(trail):
    assert VerifyAudit(trail).execute(user(Role.AUDITOR)).intact is True


def test_verify_detects_a_modified_detail(audit, trail):
    fill(audit, 5)
    entries = trail._entries["t1"]
    entries[2] = replace(entries[2], detail="alterado")
    r = VerifyAudit(trail).execute(user(Role.AUDITOR))
    assert (r.intact, r.first_invalid_seq) == (False, 3)


def test_verify_detects_a_deleted_entry_in_the_middle(audit, trail):
    fill(audit, 5)
    del trail._entries["t1"][1]  # falta el seq 2
    r = VerifyAudit(trail).execute(user(Role.AUDITOR))
    assert (r.intact, r.first_invalid_seq) == (False, 3)


def test_verify_detects_reordered_entries(audit, trail):
    fill(audit, 5)
    e = trail._entries["t1"]
    e[1], e[2] = e[2], e[1]
    r = VerifyAudit(trail).execute(user(Role.AUDITOR))
    assert (r.intact, r.first_invalid_seq) == (False, 3)


def test_verify_detects_rewritten_last_entry_hash(audit, trail):
    fill(audit, 3)
    e = trail._entries["t1"]
    e[-1] = replace(e[-1], hash="f" * 64)
    assert VerifyAudit(trail).execute(user(Role.AUDITOR)).first_invalid_seq == 3


# ---------------- permisos ----------------
@pytest.mark.parametrize("role", [Role.LOADER, Role.EVALUATOR, Role.APPROVER])
def test_only_the_auditor_can_list_and_verify(role, audit, trail):
    fill(audit, 1)
    with pytest.raises(PermissionDenied):
        ListAudit(trail).execute(user(role), after_seq=0, limit=10)
    with pytest.raises(PermissionDenied):
        VerifyAudit(trail).execute(user(role))
