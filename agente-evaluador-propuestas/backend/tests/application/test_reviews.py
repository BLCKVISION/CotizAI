"""Revisión humana (P-4): notas, correcciones y decisión. Nunca tocan el resultado original."""

from datetime import UTC, datetime, timedelta
from itertools import count

import pytest

from evaluador.adapters.outbound.memory.reviews import InMemoryReviews
from evaluador.application.use_cases.reviews import AddReview, ListReviews
from evaluador.domain.errors import InvalidData, NotFound, PermissionDenied
from evaluador.domain.identity import Role, User
from evaluador.domain.review import ReviewKind

T0 = datetime(2026, 1, 1, tzinfo=UTC)


class Ids:
    def __init__(self) -> None:
        self._n = count(1)

    def new(self) -> str:
        return f"r{next(self._n)}"


class Clock:
    def __init__(self) -> None:
        self._n = count()

    def now(self) -> datetime:
        return T0 + timedelta(minutes=next(self._n))


class Audit:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    def register(self, *, tenant_id, actor, action, detail=""):
        self.calls.append({"tenant_id": tenant_id, "actor": actor, "action": action, "detail": detail})


class Lookup:
    """Evaluación `j1` del tenant `t1` con las propuestas A y B."""

    def exists(self, tenant_id, job_id):
        return (tenant_id, job_id) == ("t1", "j1")

    def proposal_ids(self, tenant_id, job_id):
        return {"A", "B"} if self.exists(tenant_id, job_id) else None


def user(role: Role, tenant: str = "t1") -> User:
    return User(id=f"{tenant}-{role}", tenant_id=tenant, email=f"{role}@x.test", password_hash="h", role=role)


@pytest.fixture
def repo():
    return InMemoryReviews()


@pytest.fixture
def audit():
    return Audit()


@pytest.fixture
def add(repo, audit):
    return AddReview(repo, Lookup(), Ids(), Clock(), audit)


def note(add, actor, text="Revisar la garantía", proposal_id="A", job="j1"):
    return add.execute(actor, job_id=job, kind=ReviewKind.NOTE, text=text, proposal_id=proposal_id, payload=None)


def test_evaluator_and_approver_can_add_notes(add, repo):
    for role in (Role.EVALUATOR, Role.APPROVER):
        r = note(add, user(role))
        assert r.author_id == f"t1-{role}" and r.kind is ReviewKind.NOTE and r.tenant_id == "t1"
    assert len(repo.list_for_job("t1", "j1")) == 2


def test_general_note_without_proposal_is_allowed(add):
    assert note(add, user(Role.EVALUATOR), proposal_id=None).proposal_id is None


def test_loader_and_auditor_cannot_review(add):
    for role in (Role.LOADER, Role.AUDITOR):
        with pytest.raises(PermissionDenied):
            note(add, user(role))


@pytest.mark.parametrize("text", ["", "   ", "x" * 2001])
def test_text_must_have_1_to_2000_characters(add, text):
    with pytest.raises(InvalidData):
        note(add, user(Role.EVALUATOR), text=text)


def test_text_is_trimmed_and_2000_chars_is_accepted(add):
    assert note(add, user(Role.EVALUATOR), text="  hola  ").text == "hola"
    assert len(note(add, user(Role.EVALUATOR), text="x" * 2000).text) == 2000


def test_unknown_evaluation_or_other_tenant_is_not_found(add):
    with pytest.raises(NotFound):
        note(add, user(Role.EVALUATOR), job="zzz")
    with pytest.raises(NotFound):
        note(add, user(Role.EVALUATOR, "t2"))  # j1 existe, pero en otro tenant


def test_proposal_must_belong_to_the_evaluation(add):
    with pytest.raises(InvalidData):
        note(add, user(Role.EVALUATOR), proposal_id="Z")


def test_correction_requires_payload_and_proposal(add):
    ev = user(Role.EVALUATOR)
    for payload in (None, {}):
        with pytest.raises(InvalidData):
            add.execute(ev, job_id="j1", kind=ReviewKind.CORRECTION, text="x", proposal_id="A", payload=payload)
    with pytest.raises(InvalidData):
        add.execute(
            ev, job_id="j1", kind=ReviewKind.CORRECTION, text="x", proposal_id=None, payload={"supplier": "Alfa"}
        )


def test_correction_is_stored_apart_and_validates_verdict(add, repo):
    ev = user(Role.EVALUATOR)
    r = add.execute(
        ev,
        job_id="j1",
        kind=ReviewKind.CORRECTION,
        text="El RIF es otro",
        proposal_id="A",
        payload={"supplier": "Alfa C.A."},
    )
    assert r.payload == {"supplier": "Alfa C.A."} and repo.list_for_job("t1", "j1") == [r]
    with pytest.raises(InvalidData):
        add.execute(
            ev, job_id="j1", kind=ReviewKind.CORRECTION, text="x", proposal_id="A", payload={"verdict": "maybe"}
        )
    ok = add.execute(
        ev, job_id="j1", kind=ReviewKind.CORRECTION, text="Era válida", proposal_id="A", payload={"verdict": "valid"}
    )
    assert ok.payload == {"verdict": "valid"}


@pytest.mark.parametrize("payload", [{"bad key": "x"}, {"k": "x" * 501}, {f"k{i}": "v" for i in range(11)}])
def test_correction_payload_is_bounded(add, payload):
    with pytest.raises(InvalidData):
        add.execute(
            user(Role.EVALUATOR), job_id="j1", kind=ReviewKind.CORRECTION, text="x", proposal_id="A", payload=payload
        )


def test_only_the_approver_can_record_a_decision(add):
    args = dict(
        job_id="j1", kind=ReviewKind.DECISION, text="Adjudicar a Alfa", proposal_id="A", payload={"decision": "award"}
    )
    with pytest.raises(PermissionDenied):
        add.execute(user(Role.EVALUATOR), **args)
    assert add.execute(user(Role.APPROVER), **args).kind is ReviewKind.DECISION


def test_decision_needs_proposal_and_a_valid_decision(add):
    ap = user(Role.APPROVER)
    for proposal_id, payload in (
        (None, {"decision": "award"}),
        ("A", None),
        ("A", {"decision": "maybe"}),
        ("A", {"x": "y"}),
    ):
        with pytest.raises(InvalidData):
            add.execute(ap, job_id="j1", kind=ReviewKind.DECISION, text="x", proposal_id=proposal_id, payload=payload)


def test_audit_records_id_and_kind_but_never_the_text(add, audit):
    r = note(add, user(Role.EVALUATOR), text="TEXTO CONFIDENCIAL")
    (c,) = audit.calls
    assert c["action"] == "review_added" and r.id in c["detail"] and "note" in c["detail"]
    assert "CONFIDENCIAL" not in str(c) and c["tenant_id"] == "t1" and c["actor"] == "t1-evaluator"


def test_no_audit_when_validation_fails(add, audit):
    with pytest.raises(InvalidData):
        note(add, user(Role.EVALUATOR), text="")
    assert audit.calls == []


def test_list_requires_view_results_and_is_chronological(add, repo):
    note(add, user(Role.EVALUATOR), text="primera")
    note(add, user(Role.APPROVER), text="segunda")
    lst = ListReviews(repo, Lookup())
    assert [r.text for r in lst.execute(user(Role.AUDITOR), "j1")] == ["primera", "segunda"]
    with pytest.raises(PermissionDenied):
        lst.execute(user(Role.LOADER), "j1")


def test_list_is_isolated_by_tenant_and_evaluation(add, repo):
    note(add, user(Role.EVALUATOR))
    lst = ListReviews(repo, Lookup())
    with pytest.raises(NotFound):
        lst.execute(user(Role.EVALUATOR, "t2"), "j1")
    with pytest.raises(NotFound):
        lst.execute(user(Role.EVALUATOR), "otro")
    assert repo.list_for_job("t2", "j1") == []
