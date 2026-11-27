"""POST /transcriptions: foto de un presupuesto -> Markdown.

El cuerpo es el archivo en binario crudo y el nombre viaja en `?archivo=` (lo usa solo para comprobar que la extensión
corresponde al contenido). La autenticación se resuelve ANTES de leer el cuerpo (dependencias previas a la función),
el archivo se lee en memoria con tope propio y la ruta está exenta del tope JSON del interceptor de trazabilidad.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, ConfigDict

from evaluador.adapters.inbound.http.guards import require
from evaluador.adapters.outbound.extraction.reader import MAX_BYTES
from evaluador.adapters.outbound.extraction.transcription import Transcription
from evaluador.application.use_cases.authentication import AuthenticatedSession
from evaluador.domain.errors import PayloadTooLarge
from evaluador.domain.identity import Permission

router = APIRouter(prefix="/transcriptions", tags=["transcriptions"])

_OPENAPI_BODY = {
    "requestBody": {
        "required": True,
        "content": {"application/octet-stream": {"schema": {"type": "string", "format": "binary"}}},
    }
}


class TranscriptionResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    markdown: str
    uncertain: list[str]
    quality: str
    notices: list[str]

    @classmethod
    def from_domain(cls, t: Transcription) -> TranscriptionResponse:
        return cls(markdown=t.markdown, uncertain=list(t.uncertain), quality=t.quality, notices=list(t.notices))


async def _read_body(request: Request) -> bytes:
    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > MAX_BYTES:  # se rechaza sin leer nada
        raise PayloadTooLarge("El archivo excede el tamaño máximo de 25 MiB.")
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > MAX_BYTES:
            raise PayloadTooLarge("El archivo excede el tamaño máximo de 25 MiB.")
    return bytes(body)


@router.post("", openapi_extra=_OPENAPI_BODY)
async def transcribe(
    request: Request,
    archivo: Annotated[str, Query(min_length=1, max_length=255)],
    session: Annotated[AuthenticatedSession, Depends(require(Permission.LOAD_DOCUMENTS))],
) -> TranscriptionResponse:
    data = await _read_body(request)
    result = await run_in_threadpool(request.app.state.container.transcribe.execute, session.user, archivo, data)
    return TranscriptionResponse.from_domain(result)
