"""Conversation with the procurement assistant."""

from __future__ import annotations

import base64
from dataclasses import asdict
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from pydantic import Field

from evaluador.adapters.inbound.http.dtos import ID_PATRON, DtoEntrada, DtoSalida
from evaluador.adapters.inbound.http.guards import exigir
from evaluador.application.ports.assistant import REPORT_MEDIA_TYPES
from evaluador.application.use_cases.autenticacion import SesionAutenticada
from evaluador.domain.assistant.guardrails import MAX_MESSAGE_CHARS
from evaluador.domain.identidad import Permiso

router = APIRouter(prefix="/assistant", tags=["assistant"])


class AssistantMessageDto(DtoEntrada):
    message: Annotated[str, Field(min_length=1, max_length=MAX_MESSAGE_CHARS)]
    conversation_id: Annotated[str | None, Field(pattern=ID_PATRON)] = None


class ReportFileDto(DtoSalida):
    filename: str
    format: str
    media_type: str
    content_base64: str


class AssistantReplyDto(DtoSalida):
    conversation_id: str
    answer: str
    # Set when a guardrail stopped the request or the answer.
    refusal: str | None
    tools_used: list[str]
    links: list[str]
    reports: list[ReportFileDto]


@router.post("/messages")
def send_message(
    dto: AssistantMessageDto,
    request: Request,
    session: Annotated[SesionAutenticada, Depends(exigir(Permiso.VER_RESULTADOS))],
) -> AssistantReplyDto:
    # Each message costs model calls, so the limit is per user rather than per address.
    request.app.state.assistant_limiter.verificar(f"{session.tenant_id}:{session.usuario.id}")
    reply = request.app.state.contenedor.ask_assistant.execute(session.usuario, dto.message, dto.conversation_id)
    data = asdict(reply)
    data["reports"] = [
        {
            "filename": r.filename,
            "format": r.format,
            "media_type": REPORT_MEDIA_TYPES[r.format],
            "content_base64": base64.b64encode(r.content).decode("ascii"),
        }
        for r in reply.reports
    ]
    return AssistantReplyDto.model_validate(data)
