from dataclasses import replace
from datetime import UTC, datetime
from itertools import count

import pytest

from evaluador.adapters.outbound.agent.langgraph_engine import LanggraphEngine
from evaluador.adapters.outbound.ai.fake_embedder import FakeEmbedder
from evaluador.adapters.outbound.ai.fake_model import FakeModel
from evaluador.adapters.outbound.memory.jobs import InMemoryJobEvents, InMemoryJobs, InMemoryResults
from evaluador.adapters.outbound.memory.repositories import InMemoryProjects
from evaluador.adapters.outbound.memory.vector_index import InMemoryIndex
from evaluador.application.ports.documents import ReadContent
from evaluador.application.use_cases.evaluate_file import EvaluateFile
from evaluador.application.use_cases.evaluation_flow import (
    GetEvaluationResult,
    ListJobEvents,
    RunNextJob,
    StartEvaluation,
)
from evaluador.domain.errors import InvalidData, InvalidTransition, NotFound, PermissionDenied
from evaluador.domain.evaluation import FindingCode, Verdict
from evaluador.domain.extraction import ProposalExtraction, ScopeJudgment
from evaluador.domain.identity import Role, User
from evaluador.domain.project import Project, ProjectState
from evaluador.domain.result import ResultOut
from evaluador.domain.score import CriterionScore, ScoredRubric
from evaluador.domain.workflow import EventKind, JobStatus, Proposal

NOW = datetime(2026, 1, 1, 12, tzinfo=UTC)
CATEGORIES = ("gabinete", "monitor", "teclado", "raton", "protector")


class FixedClock:
    def now(self) -> datetime:
        return NOW


class ListAudit:
    def __init__(self) -> None:
        self.entries: list[dict] = []

    def register(self, *, tenant_id, actor, action, detail="") -> None:
        self.entries.append({"tenant": tenant_id, "actor": actor, "action": action, "detail": detail})


class Ids:
    def __init__(self) -> None:
        self._n = count(1)

    def new(self) -> str:
        return f"00000000-0000-0000-0000-{next(self._n):012d}"


class DictProposals:
    def __init__(self) -> None:
        self.items: dict[tuple[str, str], Proposal] = {}

    def save(self, proposal: Proposal) -> None:
        self.items[(proposal.tenant_id, proposal.id)] = proposal

    def by_id(self, tenant_id, proposal_id):
        return self.items.get((tenant_id, proposal_id))

    def list_for_project(self, tenant_id, project_id):
        return sorted(
            (p for p in self.items.values() if p.tenant_id == tenant_id and p.project_id == project_id),
            key=lambda p: p.filename,
        )

    def delete(self, tenant_id, proposal_id) -> None:
        self.items.pop((tenant_id, proposal_id), None)


class DictFiles:
    def __init__(self) -> None:
        self.data: dict[tuple[str, str], bytes] = {}

    def put(self, tenant_id, key, data) -> None:
        self.data[(tenant_id, key)] = data

    def get(self, tenant_id, key) -> bytes:
        try:
            return self.data[(tenant_id, key)]
        except KeyError:
            raise NotFound("Archivo no encontrado.") from None

    def delete(self, tenant_id, key) -> None:
        self.data.pop((tenant_id, key), None)


def amount(v: str) -> dict:
    return {"literal": v, "value": v}


def line(cat: str, total="1100.00", price="100.00") -> dict:
    return {
        "description": cat, "category": cat, "quantity": amount("11"), "unit_price": amount(price),
        "line_total": amount(total), "evidence": {"page_or_cell": "p.1", "text": f"{cat} 11 x {price}"},
    }  # fmt: skip


def extraction_for(text: str) -> ProposalExtraction:
    broken = "ROTA" in text  # el total de la primera línea no cuadra: ARITMETICA descarta
    lines = [line(c, total="1000.00" if broken and c == "gabinete" else "1100.00") for c in CATEGORIES]
    return ProposalExtraction.model_validate(
        {
            "supplier": "Proveedor " + text.split()[1], "currency": "USD", "lines": lines,
            "totals": {"subtotal": amount("5500.00"), "total": amount("5500.00")},
        }
    )  # fmt: skip


def rubric_for(text: str) -> ScoredRubric:
    s = 95 if "ALTA" in text else 80
    c = CriterionScore(score=s, evidence=["cita"])
    return ScoredRubric(performance=c, protection_and_peripherals=c, warranty_and_support=c)


TEXT_BODY = "Incluye instalación, garantía de 3 años y soporte técnico."
DOCS = {
    "Propuesta_A.pdf": f"Alfa ALTA {TEXT_BODY}",
    "Propuesta_B.pdf": f"Beta BAJA {TEXT_BODY}",
    "Propuesta_C.pdf": f"Gama ROTA {TEXT_BODY}",
}


def user(role=Role.EVALUATOR, tenant="t1") -> User:
    return User(id=f"{tenant}-{role}", tenant_id=tenant, email=f"{role}@x.test", password_hash="x", role=role)


class Env:
    """Todo el flujo en memoria con modelo falso y el motor real (mismo pipeline que el lote)."""

    def __init__(self, docs=None, results=None, job_retries=2, tenant="t1", project_id="proj-1") -> None:
        self.tenant, self.project_id = tenant, project_id
        self.projects, self.proposals, self.files = InMemoryProjects(), DictProposals(), DictFiles()
        self.jobs, self.events = InMemoryJobs(), InMemoryJobEvents()
        self.results = results or InMemoryResults()
        self.audit, self.ids, self.clock = ListAudit(), Ids(), FixedClock()
        model = FakeModel(
            {ProposalExtraction: extraction_for, ScopeJudgment: ScopeJudgment(meets=True), ScoredRubric: rubric_for}
        )
        emb, idx = FakeEmbedder(), InMemoryIndex()
        chunk_ids = count()
        self.model = model
        evaluator = EvaluateFile(
            read=lambda name, data: ReadContent(data.decode()), embedder=emb, index=idx,
            engine=LanggraphEngine(model, emb, idx), model=model, requirement="11 equipos",
            chunk_id=lambda: f"c{next(chunk_ids)}",
        )  # fmt: skip
        self.start = StartEvaluation(self.projects, self.proposals, self.jobs, self.ids, self.clock, self.audit)
        self.run = RunNextJob(
            jobs=self.jobs, events=self.events, results=self.results, proposals=self.proposals, files=self.files,
            projects=self.projects, evaluator=evaluator, clock=self.clock, audit=self.audit,
            wait=lambda s: None, job_retries=job_retries,
        )  # fmt: skip
        self.get = GetEvaluationResult(self.jobs, self.results)
        self.list_events = ListJobEvents(self.jobs, self.events)
        self.project = Project.create(
            id=project_id, tenant_id=tenant, name="Lab", requirement="11 equipos", location="Caracas",
            reference_budget=None, created_by="u", now=NOW,
        )  # fmt: skip
        self.projects.save(self.project)
        for name, text in (docs or DOCS).items():
            self.add(name, text)

    def add(self, name: str, text: str) -> None:
        tenant, project = self.tenant, self.project_id
        key = f"k-{name}"
        self.files.put(tenant, key, text.encode())
        self.proposals.save(Proposal(
            id=self.ids.new(), tenant_id=tenant, project_id=project, filename=name, sha256="0" * 64,
            size_bytes=len(text), storage_key=key, uploaded_by="u", created=NOW,
        ))  # fmt: skip

    def state(self) -> ProjectState:
        return self.projects.by_id(self.tenant, self.project_id).state


# ---------------- StartEvaluation ----------------
def test_start_moves_project_to_evaluating_and_enqueues_a_job():
    env = Env()
    job = env.start.execute(user(), "proj-1")
    assert job.status is JobStatus.QUEUED and job.project_id == "proj-1" and job.tenant_id == "t1"
    assert env.state() is ProjectState.EVALUATING
    assert env.jobs.by_id("t1", job.id) == job
    assert any(a["action"] == "evaluation_started" and a["detail"] == job.id for a in env.audit.entries)


def test_start_twice_returns_the_active_job_without_creating_another():
    env = Env()
    first = env.start.execute(user(), "proj-1")
    again = env.start.execute(user(Role.LOADER), "proj-1")
    assert again.id == first.id


@pytest.mark.parametrize("n_files, ok", [(2, False), (3, True), (20, True), (21, False)])
def test_start_requires_between_3_and_20_proposals(n_files, ok):
    env = Env(docs={f"P{i:02d}.pdf": f"Alfa x {TEXT_BODY}" for i in range(n_files)})
    if ok:
        env.start.execute(user(), "proj-1")
    else:
        with pytest.raises(InvalidData):
            env.start.execute(user(), "proj-1")
        assert env.state() is ProjectState.RECEIVING


def test_start_requires_permission_and_tenant_and_receiving_state():
    env = Env()
    with pytest.raises(PermissionDenied):
        env.start.execute(user(Role.AUDITOR), "proj-1")
    with pytest.raises(NotFound):
        env.start.execute(user(tenant="t2"), "proj-1")
    env.projects.save(replace(env.project, state=ProjectState.CLOSED, closing_reason="x"))
    with pytest.raises(InvalidTransition):
        env.start.execute(user(), "proj-1")


# ---------------- RunNextJob (extremo a extremo) ----------------
def run_all():
    env = Env()
    job = env.start.execute(user(), "proj-1")
    done = env.run.execute()
    return env, job, done


def test_run_returns_none_when_the_queue_is_empty():
    assert Env().run.execute() is None


def test_run_evaluates_all_proposals_and_stores_a_coherent_result():
    env, job, done = run_all()
    assert done.status is JobStatus.DONE and done.id == job.id and done.attempts == 1 and done.finished == NOW
    result = env.get.execute(user(), job.id)
    assert isinstance(result, ResultOut) and result.status == "done" and result.project_id == "proj-1"
    assert result.delta == "3" and result.generated == NOW
    by_id = {p.id: p for p in result.proposals}
    assert set(by_id) == {"Propuesta_A", "Propuesta_B", "Propuesta_C"}
    assert result.ranking == ["Propuesta_A", "Propuesta_B", "Propuesta_C"]  # válida 95, válida 80, descartada
    a, b, c = by_id["Propuesta_A"], by_id["Propuesta_B"], by_id["Propuesta_C"]
    assert (a.verdict, b.verdict, c.verdict) == (Verdict.VALID, Verdict.VALID, Verdict.DISCARDED)
    assert a.score == "95.00" and b.score == "80.00" and c.score is None
    assert a.supplier == "Proveedor ALTA" and a.currency == "USD"
    assert a.criteria and a.criteria.performance.score == 95 and a.criteria.performance.evidence == ["cita"]
    assert a.cost.total == "5500.00" and a.cost.steps[0].item == "Monto base" and a.cost.steps[0].amount == "5500.00"
    assert len(a.lines) == 5 and a.lines[0].evidence.text and a.lines[0].line_total.literal == "1100.00"
    assert any(f.code is FindingCode.ARITMETICA and f.discards for f in c.findings)
    assert c.cost.steps  # una descartada también muestra su desglose, para que el comité lo vea
    assert env.state() is ProjectState.COMMITTEE_REVIEW


def test_run_emits_ordered_events_without_document_content():
    env, job, _ = run_all()
    events = env.list_events.execute(user(), job.id)
    assert [e.seq for e in events] == list(range(1, len(events) + 1))
    kinds = [e.kind for e in events]
    assert kinds[0] is EventKind.INFO and kinds[-1] is EventKind.INFO
    assert kinds.count(EventKind.READ) == 3 and kinds.count(EventKind.DECISION) == 3
    assert kinds.count(EventKind.CALC) >= 2
    for name in DOCS:  # por archivo: leer antes de decidir
        stem = name.removesuffix(".pdf")
        mine = [e for e in events if stem in e.message or name in e.message]
        assert [e.kind for e in mine if e.kind in (EventKind.READ, EventKind.DECISION)] == [
            EventKind.READ, EventKind.DECISION,
        ]  # fmt: skip
    text = " ".join(e.message for e in events)
    assert TEXT_BODY not in text and "Alfa" not in text  # nunca contenido del documento
    assert [e.seq for e in env.list_events.execute(user(), job.id, after_seq=2)] == [e.seq for e in events[2:]]


def test_a_file_that_cannot_be_read_is_pending_review_and_the_job_still_finishes():
    env = Env()
    env.files.delete("t1", "k-Propuesta_B.pdf")
    job = env.start.execute(user(), "proj-1")
    done = env.run.execute()
    assert done.status is JobStatus.DONE
    result = env.get.execute(user(), job.id)
    b = next(p for p in result.proposals if p.id == "Propuesta_B")
    assert b.verdict is Verdict.PENDING_REVIEW and b.cost.total is None
    assert any(f.code is FindingCode.LECTURA and not f.discards for f in b.findings)
    assert result.ranking == ["Propuesta_A", "Propuesta_B", "Propuesta_C"]
    assert any(e.kind is EventKind.ERROR for e in env.list_events.execute(user(), job.id))


class FailingResults(InMemoryResults):
    def save(self, tenant_id, job_id, result) -> None:
        raise RuntimeError("disco lleno: contenido secreto del documento")


def test_total_failure_is_retried_then_fails_and_reopens_the_project():
    env = Env(results=FailingResults(), job_retries=2)
    job = env.start.execute(user(), "proj-1")
    outcomes = [env.run.execute() for _ in range(4)]
    assert [o.status if o else None for o in outcomes] == [JobStatus.QUEUED, JobStatus.QUEUED, JobStatus.FAILED, None]
    failed = env.jobs.by_id("t1", job.id)
    assert failed.status is JobStatus.FAILED and failed.attempts == 3 and failed.error == "RuntimeError"
    assert "secreto" not in (failed.error or "")
    assert env.state() is ProjectState.RECEIVING  # se puede volver a intentar
    assert env.get.execute(user(), job.id).status == "failed"
    errors = [e for e in env.list_events.execute(user(), job.id) if e.kind is EventKind.ERROR]
    assert len(errors) == 3 and all("secreto" not in e.message for e in errors)
    seqs = [e.seq for e in env.list_events.execute(user(), job.id)]
    assert seqs == sorted(set(seqs))  # el contador sigue creciendo entre reintentos del trabajo


def test_two_runs_do_not_process_the_same_job_twice():
    env = Env()
    env.start.execute(user(), "proj-1")
    assert env.run.execute() is not None and env.run.execute() is None


# ---------------- GetEvaluationResult / ListJobEvents ----------------
def test_result_of_a_queued_job_is_an_empty_result_with_status():
    env = Env()
    job = env.start.execute(user(), "proj-1")
    r = env.get.execute(user(), job.id)
    assert r.status == "queued" and r.ranking == [] and r.proposals == [] and r.id == job.id


def test_result_and_events_respect_tenant_and_permission():
    env, job, _ = run_all()
    with pytest.raises(NotFound):
        env.get.execute(user(tenant="t2"), job.id)
    with pytest.raises(NotFound):
        env.list_events.execute(user(tenant="t2"), job.id)
    with pytest.raises(PermissionDenied):
        env.get.execute(user(Role.LOADER), job.id)
    with pytest.raises(PermissionDenied):
        env.list_events.execute(user(Role.LOADER), job.id)
    with pytest.raises(NotFound):
        env.get.execute(user(), "00000000-0000-0000-0000-00000000ffff")
    assert env.get.execute(user(Role.AUDITOR), job.id).status == "done"
