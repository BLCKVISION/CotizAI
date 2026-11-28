"""Run and read project evaluations, download the auditable report and ask questions about the result."""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from dataclasses import asdict
from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, Path, Query, Request, Response, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from pydantic import Field

from evaluador.adapters.inbound.http.dtos import ID_PATRON, DtoEntrada, DtoSalida
from evaluador.adapters.inbound.http.guards import exigir
from evaluador.adapters.outbound.reportes.assistant_report import ReportFileRenderer
from evaluador.application.ports.assistant import REPORT_MEDIA_TYPES
from evaluador.application.use_cases.autenticacion import SesionAutenticada
from evaluador.domain.identidad import Permiso
from evaluador.domain.project_evaluation import ProjectEvaluation, ReviewDecision

router = APIRouter(prefix="/proyectos", tags=["evaluations"])
ProjectId = Annotated[str, Path(pattern=ID_PATRON)]


class FindingResponseDto(DtoSalida):
    code: str
    severity: str
    discards: bool
    reason: str
    evidence: str
    origin: str


class CostStepResponseDto(DtoSalida):
    concept: str
    amount: Decimal | None
    detail: str


class CriterionResponseDto(DtoSalida):
    criterion: str
    score: int
    weight: int
    evidence: list[str]


class TraceStepResponseDto(DtoSalida):
    step: str
    title: str
    status: str
    detail: list[str]


class ProposalEvaluationResponseDto(DtoSalida):
    proposal_id: str
    filename: str
    verdict: str
    score: Decimal | None
    real_cost: Decimal | None
    currency: str | None
    converted_cost: Decimal | None
    converted_currency: str | None
    findings: list[FindingResponseDto]
    supplier: str | None
    cost_steps: list[CostStepResponseDto]
    criteria: list[CriterionResponseDto]
    reading_warnings: list[str]
    over_budget: bool
    supplier_history: list[str]
    unverified: list[str]
    trace: list[TraceStepResponseDto]


class ExchangeRateSnapshotDto(DtoSalida):
    base: str
    quote: str
    value: Decimal
    source: str
    effective_date: str
    origin: str


class ProjectEvaluationResponseDto(DtoSalida):
    project_id: str
    evaluated_at: datetime
    target_currency: str
    evaluated_count: int
    # True when the caller may start evaluations but not see results: the lists below come back empty.
    restricted: bool
    ranking: list[str]
    items: list[ProposalEvaluationResponseDto]
    exchange_rates: list[ExchangeRateSnapshotDto]
    warnings: list[str]

    @classmethod
    def from_domain(cls, evaluation: ProjectEvaluation, *, restricted: bool = False) -> ProjectEvaluationResponseDto:
        data = asdict(evaluation)
        return cls.model_validate(
            {
                "project_id": evaluation.project_id,
                "evaluated_at": evaluation.creado,
                "target_currency": evaluation.target_currency,
                "evaluated_count": len(evaluation.items),
                "restricted": restricted,
                **{k: [] if restricted else data[k] for k in ("ranking", "items", "exchange_rates", "warnings")},
            }
        )


class EvaluationRequestDto(DtoEntrada):
    # Omitted: evaluate every stored proposal. Otherwise only these; the others keep their previous result.
    proposal_ids: Annotated[list[Annotated[str, Field(pattern=ID_PATRON)]] | None, Field(max_length=20)] = None


class ReviewRequestDto(DtoEntrada):
    proposal_id: Annotated[str, Field(pattern=ID_PATRON)]
    approved: bool
    comment: Annotated[str, Field(max_length=500)] = ""


class ReviewResponseDto(DtoSalida):
    proposal_id: str
    approved: bool
    comment: str
    decided_by: str
    decided_at: datetime

    @classmethod
    def from_domain(cls, d: ReviewDecision) -> ReviewResponseDto:
        return cls(proposal_id=d.proposal_id, approved=d.approved, comment=d.comment, decided_by=d.decided_by,
                   decided_at=d.creado)  # fmt: skip


class QuestionDto(DtoEntrada):
    question: Annotated[str, Field(min_length=3, max_length=500)]


class CitationResponseDto(DtoSalida):
    number: int
    filename: str
    excerpt: str


class AnswerResponseDto(DtoSalida):
    answer: str
    citations: list[CitationResponseDto]


@router.post("/{proyecto_id}/evaluations", status_code=status.HTTP_201_CREATED)
def evaluate_project(
    proyecto_id: ProjectId,
    request: Request,
    session: Annotated[SesionAutenticada, Depends(exigir(Permiso.INICIAR_EVALUACION))],
    dto: EvaluationRequestDto | None = None,
) -> ProjectEvaluationResponseDto:
    # A plain `def` route: FastAPI runs it in its thread pool, so a long evaluation does not block the server.
    selected = dto.proposal_ids if dto else None
    result = request.app.state.contenedor.evaluate_project.execute(session.usuario, proyecto_id, selected)
    restricted = not session.usuario.tiene(Permiso.VER_RESULTADOS)
    return ProjectEvaluationResponseDto.from_domain(result, restricted=restricted)


class RunStartedDto(DtoSalida):
    run_id: str


class RunStatusDto(DtoSalida):
    run_id: str
    status: str
    error: str


class TraceEventDto(DtoSalida):
    id: str
    run_id: str
    seq: int
    timestamp: datetime
    type: str
    title: str
    summary: str
    metadata: dict[str, object]


class TraceResponseDto(DtoSalida):
    run_id: str
    status: str
    error: str
    events: list[TraceEventDto]


RunId = Annotated[str, Path(pattern=ID_PATRON)]
_STREAM_WAIT_SECONDS = 15.0  # also the heartbeat: a comment line keeps proxies from closing an idle stream
_STREAM_MAX_SECONDS = 30 * 60


@router.post("/{proyecto_id}/evaluations/runs", status_code=status.HTTP_202_ACCEPTED)
def start_evaluation_run(
    proyecto_id: ProjectId,
    request: Request,
    session: Annotated[SesionAutenticada, Depends(exigir(Permiso.INICIAR_EVALUACION))],
    dto: EvaluationRequestDto | None = None,
) -> RunStartedDto:
    """Starts the evaluation in the background. Follow it with the status route; the admin can also stream it."""
    selected = dto.proposal_ids if dto else None
    run_id = request.app.state.contenedor.start_evaluation_run.execute(session.usuario, proyecto_id, selected)
    return RunStartedDto(run_id=run_id)


@router.get("/{proyecto_id}/evaluations/runs/{run_id}")
def get_evaluation_run_status(
    proyecto_id: ProjectId,
    run_id: RunId,
    request: Request,
    session: Annotated[SesionAutenticada, Depends(exigir(Permiso.INICIAR_EVALUACION))],
) -> RunStatusDto:
    run = request.app.state.contenedor.decision_trace.status(session.usuario, proyecto_id, run_id)
    return RunStatusDto(run_id=run.id, status=run.status, error=run.error)


@router.get("/{proyecto_id}/evaluations/runs/{run_id}/trace")
def get_evaluation_trace(
    proyecto_id: ProjectId,
    run_id: RunId,
    request: Request,
    session: Annotated[SesionAutenticada, Depends(exigir(Permiso.VIEW_DECISION_TRACE))],
) -> TraceResponseDto:
    run = request.app.state.contenedor.decision_trace.trace(session.usuario, proyecto_id, run_id)
    events = [
        TraceEventDto(
            id=e.id, run_id=e.run_id, seq=e.seq, timestamp=e.timestamp, type=e.type.value, title=e.title,
            summary=e.summary, metadata=dict(e.metadata),
        )
        for e in run.events
    ]  # fmt: skip
    return TraceResponseDto(run_id=run.id, status=run.status, error=run.error, events=events)


@router.get("/{proyecto_id}/evaluations/runs/{run_id}/stream")
async def stream_evaluation_trace(
    proyecto_id: ProjectId,
    run_id: RunId,
    request: Request,
    session: Annotated[SesionAutenticada, Depends(exigir(Permiso.VIEW_DECISION_TRACE))],
    last_event_id: Annotated[int, Header(ge=0, le=1_000_000)] = 0,
) -> StreamingResponse:
    """Server-Sent Events. `Last-Event-ID` (the last `seq` seen) resumes after a dropped connection."""
    store = request.app.state.contenedor.decision_trace
    # Authorise and check the run exists before the 200 starts: a stranger gets a plain 403/404.
    await run_in_threadpool(store.trace, session.usuario, proyecto_id, run_id, last_event_id)

    async def events() -> AsyncIterator[str]:
        seen, waited = last_event_id, 0.0
        while waited < _STREAM_MAX_SECONDS and not await request.is_disconnected():
            run = await run_in_threadpool(store.wait, session.usuario, proyecto_id, run_id, seen, _STREAM_WAIT_SECONDS)
            for event in run.events:
                seen = event.seq
                yield f"id: {event.seq}\nevent: trace\ndata: {json.dumps(event.to_wire(), ensure_ascii=False)}\n\n"
            if run.status != "running" and not run.events:
                yield f"event: end\ndata: {json.dumps({'status': run.status, 'error': run.error})}\n\n"
                return
            if not run.events:
                waited += _STREAM_WAIT_SECONDS
                yield ": heartbeat\n\n"
                await asyncio.sleep(0)

    return StreamingResponse(
        events(), media_type="text/event-stream", headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"}
    )


@router.get("/{proyecto_id}/evaluations")
def get_project_evaluation(
    proyecto_id: ProjectId,
    request: Request,
    session: Annotated[SesionAutenticada, Depends(exigir(Permiso.VER_RESULTADOS))],
) -> ProjectEvaluationResponseDto:
    result = request.app.state.contenedor.get_project_evaluation.execute(session.usuario, proyecto_id)
    return ProjectEvaluationResponseDto.from_domain(result)


@router.get("/{proyecto_id}/evaluations/report")
def download_report(
    proyecto_id: ProjectId,
    request: Request,
    session: Annotated[SesionAutenticada, Depends(exigir(Permiso.VER_RESULTADOS))],
    fmt: Annotated[Literal["pdf", "xlsx", "md", "csv"], Query()] = "md",
) -> Response:
    container = request.app.state.contenedor
    evaluation = container.get_project_evaluation.execute(session.usuario, proyecto_id)
    project = container.obtener_proyecto.ejecutar(session.usuario, proyecto_id)
    decisions = container.review_proposals.current(session.usuario, proyecto_id)
    return Response(
        ReportFileRenderer().evaluation(evaluation, project.nombre, fmt, decisions),
        media_type=REPORT_MEDIA_TYPES[fmt],
        headers={"Content-Disposition": f'attachment; filename="informe-evaluacion.{fmt}"'},
    )


@router.get("/{proyecto_id}/reviews")
def list_reviews(
    proyecto_id: ProjectId,
    request: Request,
    session: Annotated[SesionAutenticada, Depends(exigir(Permiso.VER_RESULTADOS))],
) -> list[ReviewResponseDto]:
    decisions = request.app.state.contenedor.review_proposals.current(session.usuario, proyecto_id)
    return [ReviewResponseDto.from_domain(d) for d in decisions]


@router.post("/{proyecto_id}/reviews", status_code=status.HTTP_201_CREATED)
def decide_proposal(
    proyecto_id: ProjectId,
    dto: ReviewRequestDto,
    request: Request,
    session: Annotated[SesionAutenticada, Depends(exigir(Permiso.ANOTAR_REVISION))],
) -> ReviewResponseDto:
    decision = request.app.state.contenedor.review_proposals.decide(
        session.usuario, proyecto_id, dto.proposal_id, dto.approved, dto.comment
    )
    return ReviewResponseDto.from_domain(decision)


@router.post("/{proyecto_id}/ask")
def ask_about_project(
    proyecto_id: ProjectId,
    dto: QuestionDto,
    request: Request,
    session: Annotated[SesionAutenticada, Depends(exigir(Permiso.VER_RESULTADOS))],
) -> AnswerResponseDto:
    answer = request.app.state.contenedor.ask_project.execute(session.usuario, proyecto_id, dto.question)
    return AnswerResponseDto(
        answer=answer.text, citations=[CitationResponseDto.model_validate(asdict(c)) for c in answer.citations]
    )
