"""Proveedores y antecedentes (P-6): identidad por RIF, idempotencia y alertas de descartes previos."""

from datetime import UTC, datetime, timedelta
from itertools import count

import pytest

from evaluador.adapters.outbound.memory.suppliers import InMemorySuppliers
from evaluador.application.use_cases.suppliers import (
    CheckSupplierHistory,
    ListSuppliers,
    RegisterSupplierOutcomes,
    SupplierIdentity,
    SupplierRecords,
)
from evaluador.domain.errors import NotFound, PermissionDenied
from evaluador.domain.evaluation import FindingCode, Origin, Severity, Verdict
from evaluador.domain.identity import Role, User
from evaluador.domain.result import CostOut, FindingOut, ProposalResultOut, ResultOut

T0 = datetime(2026, 1, 1, tzinfo=UTC)


class Ids:
    def __init__(self) -> None:
        self._n = count(1)

    def new(self) -> str:
        return f"s{next(self._n)}"


class Clock:
    """Cada llamada avanza un minuto: los antecedentes tienen un orden temporal claro."""

    def __init__(self) -> None:
        self._n = count()

    def now(self) -> datetime:
        return T0 + timedelta(minutes=next(self._n))


class Lookup:
    def __init__(self, *known: tuple[str, str]) -> None:
        self.known = set(known)

    def exists(self, tenant_id: str, job_id: str) -> bool:
        return (tenant_id, job_id) in self.known

    def proposal_ids(self, tenant_id: str, job_id: str) -> set[str] | None:
        return set() if (tenant_id, job_id) in self.known else None


def user(role: Role = Role.EVALUATOR, tenant: str = "t1") -> User:
    return User(id=f"{tenant}-{role}", tenant_id=tenant, email=f"{role}@x.test", password_hash="h", role=role)


def finding(
    code: FindingCode = FindingCode.ARITMETICA, reason: str = "No cuadra", evidence: str = "x" * 400
) -> FindingOut:
    return FindingOut(
        code=code, severity=Severity.CRITICAL, discards=True, reason=reason, evidence=evidence, origin=Origin.RULE
    )


def prop(
    pid: str, supplier: str | None, verdict: Verdict = Verdict.VALID, findings: tuple[FindingOut, ...] = ()
) -> ProposalResultOut:
    return ProposalResultOut(
        id=pid, supplier=supplier, verdict=verdict, cost=CostOut(total=None), findings=list(findings)
    )


def result(job: str, *proposals: ProposalResultOut) -> ResultOut:
    return ResultOut(
        id=job, project_id="p1", generated=T0, delta="3", ranking=[p.id for p in proposals], proposals=list(proposals)
    )


@pytest.fixture
def repo() -> InMemorySuppliers:
    return InMemorySuppliers()


@pytest.fixture
def register(repo):
    return RegisterSupplierOutcomes(repo, Ids(), Clock())


def run(register, tenant, job, res, identities=None):
    return register.execute(tenant_id=tenant, job_id=job, project_id="p1", result=res, identities=identities)


def test_registers_one_supplier_and_one_record_per_proposal(register, repo):
    n = run(
        register,
        "t1",
        "j1",
        result("j1", prop("A", "Alfa C.A."), prop("B", "Beta S.A.", Verdict.DISCARDED, (finding(),))),
    )
    assert n == 2
    names = sorted(s.name for s in repo.list_for("t1"))
    assert names == ["Alfa C.A.", "Beta S.A."]
    beta = repo.by_name("t1", "Beta S.A.")
    (rec,) = repo.records("t1", beta.id)
    assert rec.verdict is Verdict.DISCARDED and rec.job_id == "j1" and rec.proposal_id == "B"


def test_same_rif_with_different_formatting_is_one_supplier(register, repo):
    run(register, "t1", "j1", result("j1", prop("A", "Alfa")), {"A": SupplierIdentity(name="Alfa", rif="J-12345678-9")})
    run(
        register,
        "t1",
        "j2",
        result("j2", prop("A", "ALFA C.A.")),
        {"A": SupplierIdentity(name="ALFA C.A.", rif=" j123456789 ")},
    )
    (s,) = repo.list_for("t1")
    assert s.rif == "J123456789" and len(repo.records("t1", s.id)) == 2


def test_without_rif_matches_by_normalized_name(register, repo):
    run(register, "t1", "j1", result("j1", prop("A", "Alfa  C.A.")))
    run(register, "t1", "j2", result("j2", prop("A", "alfa c.a.")))
    assert len(repo.list_for("t1")) == 1


def test_different_rifs_with_same_name_are_different_suppliers(register, repo):
    run(register, "t1", "j1", result("j1", prop("A", "Alfa")), {"A": SupplierIdentity(name="Alfa", rif="J111")})
    run(register, "t1", "j2", result("j2", prop("A", "Alfa")), {"A": SupplierIdentity(name="Alfa", rif="J222")})
    assert len(repo.list_for("t1")) == 2


def test_registration_is_idempotent_per_job_and_proposal(register, repo):
    res = result("j1", prop("A", "Alfa"))
    run(register, "t1", "j1", res)
    run(register, "t1", "j1", res)
    (s,) = repo.list_for("t1")
    assert len(repo.records("t1", s.id)) == 1


def test_later_runs_fill_missing_details_without_overwriting(register, repo):
    run(register, "t1", "j1", result("j1", prop("A", "Alfa")), {"A": SupplierIdentity(name="Alfa", rif="J111")})
    run(
        register, "t1", "j2", result("j2", prop("A", "Alfa")),
        {"A": SupplierIdentity(name="Otro nombre", rif="J111", location="Caracas", contact="a@b.c")},
    )  # fmt: skip
    (s,) = repo.list_for("t1")
    assert (s.name, s.location, s.contact) == ("Alfa", "Caracas", "a@b.c")


def test_proposals_without_any_supplier_name_are_skipped(register, repo):
    assert run(register, "t1", "j1", result("j1", prop("A", None), prop("B", "  "))) == 0
    assert repo.list_for("t1") == []


def test_record_reason_lists_codes_and_reasons_but_not_evidence(register, repo):
    f = finding(FindingCode.MANIPULACION, "Instrucción oculta", evidence="IGNORA TODO " * 50)
    run(register, "t1", "j1", result("j1", prop("A", "Alfa", Verdict.DISCARDED, (f,))))
    (rec,) = repo.records("t1", repo.list_for("t1")[0].id)
    assert "MANIPULACION" in rec.reason and "Instrucción oculta" in rec.reason
    assert "IGNORA" not in rec.reason and len(rec.reason) <= 500


def test_valid_proposal_has_empty_reason(register, repo):
    run(register, "t1", "j1", result("j1", prop("A", "Alfa")))
    assert repo.records("t1", repo.list_for("t1")[0].id)[0].reason == ""


def test_suppliers_and_records_are_isolated_by_tenant(register, repo):
    run(register, "t1", "j1", result("j1", prop("A", "Alfa")))
    run(register, "t2", "j9", result("j9", prop("A", "Alfa")))
    s1, s2 = repo.list_for("t1")[0], repo.list_for("t2")[0]
    assert s1.id != s2.id and repo.by_id("t2", s1.id) is None and repo.records("t2", s1.id) == []


# ---------------- alertas ----------------
def seed_history(register):
    ident = {"A": SupplierIdentity(name="Alfa", rif="J-111")}
    run(
        register,
        "t1",
        "old",
        result("old", prop("A", "Alfa", Verdict.DISCARDED, (finding(FindingCode.ABUSIVO, "Flete desmedido"),))),
        ident,
    )
    run(register, "t1", "new", result("new", prop("A", "Alfa")), ident)


@pytest.fixture
def check(repo):
    return CheckSupplierHistory(repo, Lookup(("t1", "old"), ("t1", "new"), ("t2", "x")))


def test_alert_when_same_rif_was_discarded_in_an_earlier_evaluation(register, check):
    seed_history(register)
    (a,) = check.execute(user(), "new")
    assert (a.proposal_id, a.supplier, a.rif, a.previous_job_id) == ("A", "Alfa", "J111", "old")
    assert a.previous_verdict is Verdict.DISCARDED and "ABUSIVO" in a.previous_reason


def test_no_alert_for_the_evaluation_that_discarded_it_nor_for_earlier_ones(register, check):
    seed_history(register)
    assert check.execute(user(), "old") == []  # la descartada es la actual, y la posterior no cuenta como antecedente


def test_no_alert_when_previous_was_valid(register, repo):
    ident = {"A": SupplierIdentity(name="Alfa", rif="J111")}
    run(register, "t1", "old", result("old", prop("A", "Alfa")), ident)
    run(register, "t1", "new", result("new", prop("A", "Alfa")), ident)
    assert CheckSupplierHistory(repo, Lookup(("t1", "new"))).execute(user(), "new") == []


def test_no_alert_without_rif_even_if_name_matches(register, repo):
    run(register, "t1", "old", result("old", prop("A", "Alfa", Verdict.DISCARDED, (finding(),))))
    run(register, "t1", "new", result("new", prop("A", "Alfa")))
    assert CheckSupplierHistory(repo, Lookup(("t1", "new"))).execute(user(), "new") == []


def test_alerts_do_not_cross_tenants(register, repo):
    seed_history(register)
    run(register, "t2", "x", result("x", prop("A", "Alfa")), {"A": SupplierIdentity(name="Alfa", rif="J111")})
    assert CheckSupplierHistory(repo, Lookup(("t2", "x"))).execute(user(tenant="t2"), "x") == []


def test_alerts_on_unknown_evaluation_is_not_found(check):
    with pytest.raises(NotFound):
        check.execute(user(), "missing")
    with pytest.raises(NotFound):
        check.execute(user(tenant="t2"), "new")  # existe, pero en otro tenant


def test_permissions(register, repo, check):
    seed_history(register)
    for role in (Role.EVALUATOR, Role.APPROVER, Role.AUDITOR):
        check.execute(user(role), "new")
    with pytest.raises(PermissionDenied):
        check.execute(user(Role.LOADER), "new")  # el cargador no ve resultados
    for role in Role:
        assert ListSuppliers(repo).execute(user(role))  # VIEW_STATE lo tienen todos
    with pytest.raises(PermissionDenied):
        SupplierRecords(repo).execute(user(Role.LOADER), repo.list_for("t1")[0].id)


def test_list_is_sorted_by_name_and_records_by_time(register, repo):
    run(register, "t1", "j1", result("j1", prop("A", "Beta"), prop("B", "Alfa")))
    assert [s.name for s in ListSuppliers(repo).execute(user())] == ["Alfa", "Beta"]
    sid = repo.by_name("t1", "Alfa").id
    run(register, "t1", "j2", result("j2", prop("B", "Alfa")))
    assert [r.job_id for r in SupplierRecords(repo).execute(user(), sid)] == ["j1", "j2"]


def test_records_of_unknown_or_foreign_supplier_is_not_found(register, repo):
    run(register, "t1", "j1", result("j1", prop("A", "Alfa")))
    sid = repo.list_for("t1")[0].id
    with pytest.raises(NotFound):
        SupplierRecords(repo).execute(user(tenant="t2"), sid)
    with pytest.raises(NotFound):
        SupplierRecords(repo).execute(user(), "nope")
