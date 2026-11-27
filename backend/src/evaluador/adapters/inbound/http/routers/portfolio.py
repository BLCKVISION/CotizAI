"""Questions about all the projects of the organisation."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request
from pydantic import Field

from evaluador.adapters.inbound.http.dtos import DtoEntrada, DtoSalida
from evaluador.adapters.inbound.http.guards import exigir
from evaluador.application.use_cases.autenticacion import SesionAutenticada
from evaluador.domain.identidad import Permiso

router = APIRouter(prefix="/portfolio", tags=["portfolio"])


class PortfolioQuestionDto(DtoEntrada):
    question: Annotated[str, Field(min_length=2, max_length=500)]


class PortfolioAnswerDto(DtoSalida):
    answer: str


@router.post("/questions")
def ask(
    dto: PortfolioQuestionDto,
    request: Request,
    session: Annotated[SesionAutenticada, Depends(exigir(Permiso.VER_ESTADO))],
) -> PortfolioAnswerDto:
    request.app.state.assistant_limiter.verificar(f"{session.tenant_id}:{session.usuario.id}")
    return PortfolioAnswerDto(answer=request.app.state.contenedor.ask_portfolio.execute(session.usuario, dto.question))
