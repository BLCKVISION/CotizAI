"""POST /transcriptions: photo of a quote -> Markdown. The body is the raw file."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from fastapi.concurrency import run_in_threadpool

from evaluador.adapters.inbound.http.dtos import DtoSalida
from evaluador.adapters.inbound.http.guards import sesion_actual
from evaluador.application.use_cases.autenticacion import SesionAutenticada
from evaluador.domain.identidad import Permiso

router = APIRouter(prefix="/transcriptions", tags=["transcriptions"])


class TranscriptionResponse(DtoSalida):
    markdown: str
    uncertain: list[str]
    quality: str
    notices: list[str]


@router.post("")
async def transcribe(
    request: Request,
    session: Annotated[SesionAutenticada, Depends(sesion_actual)],
    archivo: Annotated[str, Query(min_length=1, max_length=255)],  # same name as the proposal upload
) -> TranscriptionResponse:
    session.usuario.exigir(Permiso.CARGAR_DOCUMENTOS)  # before reading the body
    data = await request.body()  # the tracing interceptor enforces the size limit
    use_case = request.app.state.contenedor.transcribe_image
    result = await run_in_threadpool(use_case.execute, session.usuario, archivo, data)
    return TranscriptionResponse(
        markdown=result.markdown,
        uncertain=list(result.uncertain),
        quality=result.quality,
        notices=list(result.notices),
    )
