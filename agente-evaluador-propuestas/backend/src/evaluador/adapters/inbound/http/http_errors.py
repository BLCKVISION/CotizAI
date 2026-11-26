"""Traducción de errores de dominio a HTTP. Nunca se devuelve el valor recibido ni trazas internas."""

from __future__ import annotations

import logging
from collections.abc import Mapping
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from evaluador.adapters.inbound.http.interceptors import security_headers
from evaluador.domain import errors as e
from evaluador.observability import context

_log = logging.getLogger("evaluador.errors")

_STATUS_BY_ERROR: dict[type[e.DomainError], int] = {
    e.InvalidCredentials: 401,
    e.InvalidSession: 401,
    e.PermissionDenied: 403,
    e.NotFound: 404,
    e.InvalidTransition: 409,
    e.InvalidData: 422,
}


def _response(
    status: int, code: str, message: str, extra: dict[str, Any] | None = None, headers: Mapping[str, str] | None = None
) -> JSONResponse:
    body = {"code": code, "message": message, "track_id": context.get().track_id}
    if extra:
        body.update(extra)
    return JSONResponse(body, status_code=status, headers=headers)


def register_handlers(app: FastAPI) -> None:
    @app.exception_handler(e.DomainError)
    async def _domain(_: Request, exc: e.DomainError) -> JSONResponse:
        status = _STATUS_BY_ERROR.get(type(exc), 400)
        hdr = {"WWW-Authenticate": "Bearer"} if status == 401 else None
        return _response(status, exc.code, str(exc), headers=hdr)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        # Solo ubicación y tipo del error: FastAPI incluiría 'input' (p. ej. la contraseña).
        fields = [{"field": ".".join(str(p) for p in err["loc"][1:]), "error": err["type"]} for err in exc.errors()]
        return _response(422, "invalid_payload", "El payload no es válido.", {"errors": fields})

    @app.exception_handler(StarletteHTTPException)  # incluye los 404/405 del enrutador, además de HTTPException
    async def _http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return _response(exc.status_code, f"http_{exc.status_code}", str(exc.detail), headers=exc.headers)

    @app.exception_handler(Exception)
    async def _unexpected(request: Request, exc: Exception) -> JSONResponse:
        _log.error("unexpected_error", extra={"type": type(exc).__name__}, exc_info=exc)
        # Este handler corre fuera de los interceptores: la trazabilidad y las cabeceras se añaden aquí.
        hdr = {"X-Track-Id": context.get().track_id} | security_headers(
            production=getattr(request.app.state, "production", False), path=request.url.path
        )
        return _response(500, "internal_error", "Error interno. Reporte el trackId.", headers=hdr)
