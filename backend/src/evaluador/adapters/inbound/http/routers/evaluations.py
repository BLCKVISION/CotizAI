"""Run and read project evaluations, download the auditable report and ask questions about the result."""

from __future__ import annotations

from dataclasses import asdict
from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Path, Query, Request, Response, status
from pydantic import Field

from evaluador.adapters.inbound.http.dtos import ID_PATRON, DtoEntrada, DtoSalida
from evaluador.adapters.inbound.http.guards import exigir
from evaluador.adapters.outbound.reportes.evaluation_report import render_csv_report, render_markdown_report
from evaluador.application.use_cases.autenticacion import SesionAutenticada
from evaluador.domain.identidad import Permiso
from evaluador.domain.project_evaluation import ProjectEvaluation

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
) -> ProjectEvaluationResponseDto:
    # A plain `def` route: FastAPI runs it in its thread pool, so a long evaluation does not block the server.
    result = request.app.state.contenedor.evaluate_project.execute(session.usuario, proyecto_id)
    restricted = not session.usuario.tiene(Permiso.VER_RESULTADOS)
    return ProjectEvaluationResponseDto.from_domain(result, restricted=restricted)


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
    fmt: Annotated[Literal["md", "csv"], Query()] = "md",
) -> Response:
    container = request.app.state.contenedor
    evaluation = container.get_project_evaluation.execute(session.usuario, proyecto_id)
    project = container.obtener_proyecto.ejecutar(session.usuario, proyecto_id)
    if fmt == "csv":
        body, media_type = "﻿" + render_csv_report(evaluation), "text/csv"  # BOM: Excel reads accents
    else:
        body, media_type = render_markdown_report(evaluation, project.nombre), "text/markdown"
    return Response(
        body,
        media_type=f"{media_type}; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="informe-evaluacion.{fmt}"'},
    )


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
