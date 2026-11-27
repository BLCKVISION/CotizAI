"""Carga, listado y borrado de propuestas de un proyecto.

CABLEADO: el Container debe exponer `upload_proposal`, `list_proposals` y `delete_proposal`, y la app debe incluir
este router. El interceptor de trazabilidad limita todo cuerpo a `max_bytes_payload` (1 MiB) y lo copia para el
log: la ruta `POST /api/v1/projects/{id}/proposals` debe quedar exenta (tope propio de `MAX_REQUEST_BYTES`, sin copiar
el cuerpo al log).

El archivo se lee en memoria (nunca a un temporal sin cifrar) y la autenticación se resuelve ANTES de leer el cuerpo:
por eso no se declara un parámetro `File(...)` (FastAPI parsearía el formulario antes de los guards).
"""

from __future__ import annotations

from collections.abc import AsyncGenerator, AsyncIterator
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Path, Request, Response, status
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, ConfigDict
from starlette.datastructures import UploadFile
from starlette.formparsers import MultiPartException, MultiPartParser

from evaluador.adapters.inbound.http.dtos import ID_PATTERN
from evaluador.adapters.inbound.http.guards import require
from evaluador.adapters.outbound.extraction.reader import MAX_BYTES
from evaluador.application.use_cases.authentication import AuthenticatedSession
from evaluador.domain.errors import InvalidData, PayloadTooLarge
from evaluador.domain.identity import Permission
from evaluador.domain.workflow import Proposal

router = APIRouter(prefix="/projects/{project_id}/proposals", tags=["proposals"])
ProjectId = Annotated[str, Path(pattern=ID_PATTERN)]
ProposalId = Annotated[str, Path(pattern=ID_PATTERN)]

# Tope del cuerpo completo: el archivo máximo más el sobre multipart (cabeceras de las partes).
MAX_REQUEST_BYTES = MAX_BYTES + 64 * 1024

_OPENAPI_UPLOAD: dict[str, Any] = {
    "requestBody": {
        "required": True,
        "content": {
            "multipart/form-data": {
                "schema": {
                    "type": "object",
                    "required": ["file"],
                    "properties": {"file": {"type": "string", "format": "binary"}},
                }
            }
        },
    }
}


class ProposalResponse(BaseModel):
    """Sin ruta ni clave de almacenamiento: son detalles internos."""

    model_config = ConfigDict(frozen=True)

    id: str
    filename: str
    sha256: str
    size_bytes: int
    created: datetime

    @classmethod
    def from_domain(cls, p: Proposal) -> ProposalResponse:
        return cls(id=p.id, filename=p.filename, sha256=p.sha256, size_bytes=p.size_bytes, created=p.created)


async def _limited(stream: AsyncIterator[bytes], limit: int) -> AsyncGenerator[bytes, None]:
    seen = 0
    async for chunk in stream:
        seen += len(chunk)
        if seen > limit:
            raise PayloadTooLarge("El cuerpo de la petición excede el tamaño máximo permitido.")
        yield chunk


async def _read_file(request: Request) -> tuple[str, bytes]:
    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > MAX_REQUEST_BYTES:  # se rechaza sin leer nada
        raise PayloadTooLarge("El archivo excede el tamaño máximo de 25 MiB.")
    if not request.headers.get("content-type", "").lower().startswith("multipart/form-data"):
        raise InvalidData("Envíe el archivo como multipart/form-data en el campo «file».")
    parser = MultiPartParser(
        request.headers, _limited(request.stream(), MAX_REQUEST_BYTES), max_files=1, max_fields=1, max_part_size=1024
    )
    parser.spool_max_size = MAX_BYTES + 1  # el archivo se queda en memoria: un temporal en disco no iría cifrado
    try:
        form = await parser.parse()
    except MultiPartException:
        raise InvalidData("El formulario multipart no es válido.") from None
    try:
        file = form.get("file")
        if not isinstance(file, UploadFile):
            raise InvalidData("Falta el archivo en el campo «file».")
        return file.filename or "", await file.read(MAX_BYTES + 1)
    finally:
        await form.close()


@router.post("", status_code=status.HTTP_201_CREATED, openapi_extra=_OPENAPI_UPLOAD)
async def upload_proposal(
    project_id: ProjectId,
    request: Request,
    session: Annotated[AuthenticatedSession, Depends(require(Permission.LOAD_DOCUMENTS))],
) -> ProposalResponse:
    filename, data = await _read_file(request)
    proposal = await run_in_threadpool(
        request.app.state.container.upload_proposal.execute, session.user, project_id, filename, data
    )
    return ProposalResponse.from_domain(proposal)


@router.get("")
def list_proposals(
    project_id: ProjectId,
    request: Request,
    session: Annotated[AuthenticatedSession, Depends(require(Permission.VIEW_STATE))],
) -> list[ProposalResponse]:
    found = request.app.state.container.list_proposals.execute(session.user, project_id)
    return [ProposalResponse.from_domain(p) for p in found]


@router.delete("/{proposal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_proposal(
    project_id: ProjectId,
    proposal_id: ProposalId,
    request: Request,
    session: Annotated[AuthenticatedSession, Depends(require(Permission.LOAD_DOCUMENTS))],
) -> Response:
    request.app.state.container.delete_proposal.execute(session.user, project_id, proposal_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
