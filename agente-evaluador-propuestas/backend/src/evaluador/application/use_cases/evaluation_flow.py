"""Flujo de evaluación sobre la cola: encolar (StartEvaluation), ejecutar (RunNextJob, lo llama el worker) y
consultar (GetEvaluationResult, ListJobEvents). Autorización y aislamiento por tenant se aplican aquí."""

from __future__ import annotations

import logging
import time
from collections.abc import Callable
from dataclasses import replace
from decimal import Decimal
from pathlib import PurePath
from threading import Lock

from evaluador.application.ports.output import Audit, Clock, IdGenerator, ProjectRepository
from evaluador.application.ports.workflow import (
    FileStore,
    JobEventRepository,
    JobRepository,
    ProposalRepository,
    ResultRepository,
)
from evaluador.application.use_cases.batch import ProcessBatch
from evaluador.application.use_cases.evaluate_file import Evaluation, ProposalEvaluator
from evaluador.application.use_cases.result_builder import build_result
from evaluador.domain.errors import DomainError, InvalidData, NotFound
from evaluador.domain.evaluation import Verdict
from evaluador.domain.identity import Permission, User
from evaluador.domain.project import ProjectState
from evaluador.domain.ranking import RankingParams
from evaluador.domain.result import ResultOut
from evaluador.domain.workflow import EventKind, Job, JobEvent, JobStatus, Proposal

_log = logging.getLogger("evaluador.evaluation")

MIN_PROPOSALS, MAX_PROPOSALS = 3, 20
_VERDICT_LABEL = {
    Verdict.VALID: "válida",
    Verdict.DISCARDED: "descartada",
    Verdict.PENDING_REVIEW: "pendiente de revisión",
}


class StartEvaluation:
    def __init__(
        self,
        projects: ProjectRepository,
        proposals: ProposalRepository,
        jobs: JobRepository,
        ids: IdGenerator,
        clock: Clock,
        audit: Audit,
    ) -> None:
        self._projects, self._proposals, self._jobs = projects, proposals, jobs
        self._ids, self._clock, self._audit = ids, clock, audit

    def execute(self, actor: User, project_id: str) -> Job:
        actor.require(Permission.START_EVALUATION)
        project = self._projects.by_id(actor.tenant_id, project_id)
        if project is None:  # también cubre "existe pero es de otro tenant": mismo 404
            raise NotFound("Proyecto no encontrado.")
        current = self._jobs.latest_for_project(actor.tenant_id, project_id)
        if current is not None and current.status in (JobStatus.QUEUED, JobStatus.RUNNING):
            return current  # idempotente: pulsar dos veces no lanza dos evaluaciones
        evaluating = project.transition(ProjectState.EVALUATING)  # InvalidTransition si no está recibiendo
        total = len(self._proposals.list_for_project(actor.tenant_id, project_id))
        if not MIN_PROPOSALS <= total <= MAX_PROPOSALS:
            raise InvalidData(f"Se necesitan entre {MIN_PROPOSALS} y {MAX_PROPOSALS} propuestas; hay {total}.")
        job = Job(
            id=self._ids.new(),
            tenant_id=actor.tenant_id,
            project_id=project_id,
            requested_by=actor.id,
            created=self._clock.now(),
        )
        self._jobs.enqueue(job)
        self._projects.save(evaluating)
        self._audit.register(tenant_id=actor.tenant_id, actor=actor.id, action="evaluation_started", detail=job.id)
        return job


class _EventLog:
    """Eventos de un trabajo con `seq` creciente y seguro entre hilos; sigue donde quedó si el trabajo se reintenta."""

    def __init__(self, events: JobEventRepository, clock: Clock, tenant_id: str, job_id: str) -> None:
        self._events, self._clock, self._tenant, self._job = events, clock, tenant_id, job_id
        self._seq = max((e.seq for e in events.list_after(tenant_id, job_id, 0)), default=0)
        self._lock = Lock()

    def add(self, kind: EventKind, message: str) -> None:
        with self._lock:
            self._seq += 1
            self._events.append(self._tenant, JobEvent(self._job, self._seq, self._clock.now(), kind, message))


def _safe_reason(exc: BaseException) -> str:
    """Los errores de dominio llevan mensajes pensados para la persona; de los demás solo el tipo (sin contenido)."""
    return str(exc) if isinstance(exc, DomainError) else type(exc).__name__


class _ReportingEvaluator:
    """Decora al evaluador del lote para emitir el progreso: cálculo y decisión por propuesta."""

    def __init__(self, inner: ProposalEvaluator, log: _EventLog) -> None:
        self._inner, self._log = inner, log

    def evaluate(self, *, proposal_id: str, name: str, data: bytes) -> Evaluation:
        try:
            ev = self._inner.evaluate(proposal_id=proposal_id, name=name, data=data)
        except Exception as exc:
            self._log.add(EventKind.ERROR, f"{name}: no se pudo evaluar ({_safe_reason(exc)}).")
            raise
        if ev.score is not None:
            self._log.add(EventKind.CALC, f"{name}: puntaje {ev.score} y costo real calculados.")
        elif ev.cost is not None:
            self._log.add(EventKind.CALC, f"{name}: costo real calculado.")
        self._log.add(EventKind.DECISION, f"{name}: {_VERDICT_LABEL[ev.result.verdict]}.")
        return ev


def _unique_labels(proposals: list[Proposal]) -> list[tuple[str, Proposal]]:
    """Etiqueta por archivo; dos propuestas con el mismo nombre se distinguen con «(2)», «(3)»…"""
    seen: dict[str, int] = {}
    out: list[tuple[str, Proposal]] = []
    for p in proposals:
        n = seen[p.filename] = seen.get(p.filename, 0) + 1
        path = PurePath(p.filename)
        out.append((p.filename if n == 1 else f"{path.stem} ({n}){path.suffix}", p))
    return out


class RunNextJob:
    """Un paso del worker: toma el siguiente trabajo, evalúa sus propuestas con el mismo pipeline del lote y guarda
    el resultado. Si todo el procesamiento falla se reintenta el trabajo; agotados los reintentos queda FAILED y el
    proyecto vuelve a RECEIVING para poder reintentar. Un archivo que no se lee NO falla el trabajo: queda pendiente."""

    def __init__(
        self,
        *,
        jobs: JobRepository,
        events: JobEventRepository,
        results: ResultRepository,
        proposals: ProposalRepository,
        files: FileStore,
        projects: ProjectRepository,
        evaluator: ProposalEvaluator,
        clock: Clock,
        audit: Audit,
        parallel: int = 4,
        retries: int = 2,
        job_retries: int = 2,
        wait: Callable[[float], None] = time.sleep,
        delta: Decimal | None = None,
    ) -> None:
        self._jobs, self._events, self._results, self._proposals = jobs, events, results, proposals
        self._files, self._projects, self._evaluator, self._clock, self._audit = (
            files,
            projects,
            evaluator,
            clock,
            audit,
        )
        self._parallel, self._retries, self._job_retries, self._wait = parallel, retries, job_retries, wait
        self._delta = delta if delta is not None else RankingParams().delta

    def execute(self) -> Job | None:
        claimed = self._jobs.claim_next()
        if claimed is None:
            return None
        job = replace(claimed, attempts=claimed.attempts + 1, started=self._clock.now(), error=None)
        self._jobs.update(job)
        log = _EventLog(self._events, self._clock, job.tenant_id, job.id)
        try:
            self._process(job, log)
        except Exception as exc:  # noqa: BLE001 - cualquier fallo del procesamiento se reintenta; nunca se pierde el trabajo
            return self._fail(job, log, exc)
        done = replace(job, status=JobStatus.DONE, finished=self._clock.now())
        self._jobs.update(done)
        self._audit.register(tenant_id=job.tenant_id, actor=None, action="evaluation_finished", detail=job.id)
        return done

    def _process(self, job: Job, log: _EventLog) -> None:
        proposals = sorted(
            self._proposals.list_for_project(job.tenant_id, job.project_id), key=lambda p: (p.created, p.filename)
        )
        labeled = _unique_labels(proposals)
        by_label = {label: p for label, p in labeled}
        log.add(EventKind.INFO, f"Evaluación iniciada: {len(labeled)} propuestas.")

        def load(label: str) -> bytes:
            log.add(EventKind.READ, f"Leyendo {label}.")
            try:
                return self._files.get(job.tenant_id, by_label[label].storage_key)
            except Exception as exc:
                log.add(EventKind.ERROR, f"{label}: no se pudo leer el archivo ({_safe_reason(exc)}).")
                raise

        batch = ProcessBatch(
            evaluador=_ReportingEvaluator(self._evaluator, log),
            load=load,
            clock=self._clock.now,
            wait=self._wait,
            parallel=self._parallel,
            retries=self._retries,
        ).execute([label for label, _ in labeled])
        for p in batch.processed:
            if p.proposal_id not in batch.evaluations:  # no se pudo leer: decisión de revisión humana
                log.add(EventKind.DECISION, f"{p.file}: {_VERDICT_LABEL[Verdict.PENDING_REVIEW]}.")

        result = build_result(
            job_id=job.id, project_id=job.project_id, generated=self._clock.now(), delta=self._delta, batch=batch
        )
        self._results.save(job.tenant_id, job.id, result.model_dump(mode="json"))
        project = self._projects.by_id(job.tenant_id, job.project_id)
        if project is None:
            raise NotFound("Proyecto no encontrado.")
        self._projects.save(project.transition(ProjectState.COMMITTEE_REVIEW))
        log.add(EventKind.INFO, f"Ranking listo: {len(result.ranking)} propuestas ordenadas.")

    def _fail(self, job: Job, log: _EventLog, exc: Exception) -> Job:
        reason = type(exc).__name__  # nunca el mensaje: podría traer contenido de documentos
        _log.error("evaluation_failed", extra={"job": job.id, "attempt": job.attempts, "type": reason})
        if job.attempts <= self._job_retries:
            log.add(EventKind.ERROR, f"Fallo del procesamiento ({reason}); se reintentará.")
            retry = replace(job, status=JobStatus.QUEUED, error=reason)
            self._jobs.update(retry)
            return retry
        log.add(EventKind.ERROR, f"Fallo del procesamiento ({reason}); se agotaron los reintentos.")
        failed = replace(job, status=JobStatus.FAILED, error=reason, finished=self._clock.now())
        self._jobs.update(failed)
        project = self._projects.by_id(job.tenant_id, job.project_id)
        if project is not None and project.state is ProjectState.EVALUATING:
            self._projects.save(project.transition(ProjectState.RECEIVING))  # se puede volver a intentar
        self._audit.register(tenant_id=job.tenant_id, actor=None, action="evaluation_failed", detail=job.id)
        return failed


class GetEvaluationResult:
    def __init__(self, jobs: JobRepository, results: ResultRepository) -> None:
        self._jobs, self._results = jobs, results

    def execute(self, actor: User, evaluation_id: str) -> ResultOut:
        actor.require(Permission.VIEW_RESULTS)
        job = self._jobs.by_id(actor.tenant_id, evaluation_id)
        if job is None:
            raise NotFound("Evaluación no encontrada.")
        if job.status is JobStatus.DONE:
            stored = self._results.get(actor.tenant_id, job.id)
            if stored is None:
                raise NotFound("El resultado de la evaluación no está disponible.")
            return ResultOut.model_validate(stored)
        # En cola, en curso o fallida: un resultado vacío con su estado; el progreso va por /events.
        return ResultOut(
            id=job.id, project_id=job.project_id, generated=job.created, delta=str(RankingParams().delta),
            ranking=[], proposals=[], status=job.status.value,
        )  # fmt: skip


class ListJobEvents:
    def __init__(self, jobs: JobRepository, events: JobEventRepository) -> None:
        self._jobs, self._events = jobs, events

    def execute(self, actor: User, evaluation_id: str, after_seq: int = 0) -> list[JobEvent]:
        actor.require(Permission.VIEW_RESULTS)
        if self._jobs.by_id(actor.tenant_id, evaluation_id) is None:
            raise NotFound("Evaluación no encontrada.")
        return self._events.list_after(actor.tenant_id, evaluation_id, max(0, after_seq))
