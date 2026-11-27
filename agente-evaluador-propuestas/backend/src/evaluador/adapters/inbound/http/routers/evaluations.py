"""Evaluaciones: encolar, consultar resultado y seguir el progreso (el cliente consulta cada ~2 s).

Requiere en `app.state.container`: `start_evaluation` (StartEvaluation), `get_evaluation_result`
(GetEvaluationResult) y `list_job_events` (ListJobEvents).
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Request, status

from evaluador.adapters.inbound.http.dtos import ID_PATTERN, OutputDto
from evaluador.adapters.inbound.http.guards import require
from evaluador.application.use_cases.authentication import AuthenticatedSession
from evaluador.domain.identity import Permission
from evaluador.domain.result import ResultOut
from evaluador.domain.workflow import EventKind, JobEvent

router = APIRouter(tags=["evaluations"])
ProjectId = Annotated[str, Path(pattern=ID_PATTERN)]
EvaluationId = Annotated[str, Path(pattern=ID_PATTERN)]


class EvaluationStartedResponse(OutputDto):
    id: str
    status: str


class JobEventResponse(OutputDto):
    seq: int
    at: datetime
    kind: EventKind
    message: str

    @classmethod
    def from_domain(cls, e: JobEvent) -> JobEventResponse:
        return cls(seq=e.seq, at=e.at, kind=e.kind, message=e.message)


@router.post("/projects/{project_id}/evaluations", status_code=status.HTTP_202_ACCEPTED)
def start_evaluation(
    project_id: ProjectId,
    request: Request,
    session: Annotated[AuthenticatedSession, Depends(require(Permission.START_EVALUATION))],
) -> EvaluationStartedResponse:
    job = request.app.state.container.start_evaluation.execute(session.user, project_id)
    return EvaluationStartedResponse(id=job.id, status=job.status.value)


@router.get("/evaluations/{evaluation_id}")
def get_evaluation(
    evaluation_id: EvaluationId,
    request: Request,
    session: Annotated[AuthenticatedSession, Depends(require(Permission.VIEW_RESULTS))],
) -> ResultOut:
    result: ResultOut = request.app.state.container.get_evaluation_result.execute(session.user, evaluation_id)
    return result


@router.get("/evaluations/{evaluation_id}/events")
def list_evaluation_events(
    evaluation_id: EvaluationId,
    request: Request,
    session: Annotated[AuthenticatedSession, Depends(require(Permission.VIEW_RESULTS))],
    after: Annotated[int, Query(ge=0)] = 0,
) -> list[JobEventResponse]:
    events = request.app.state.container.list_job_events.execute(session.user, evaluation_id, after)
    return [JobEventResponse.from_domain(e) for e in events]
