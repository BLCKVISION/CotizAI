"""Traducción de errores de dominio a HTTP. Nunca se devuelve el valor recibido ni trazas internas."""

from __future__ import annotations

import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from evaluador.domain import errores as e
from evaluador.observabilidad import contexto

_log = logging.getLogger("evaluador.errores")

_ESTADO: dict[type[e.ErrorDeDominio], int] = {
    e.CredencialesInvalidas: 401,
    e.SesionInvalida: 401,
    e.SinPermiso: 403,
    e.NoEncontrado: 404,
    e.TransicionInvalida: 409,
    e.DatoInvalido: 422,
}


def _respuesta(estado: int, codigo: str, mensaje: str, extra: dict | None = None, cabeceras: dict | None = None):
    cuerpo = {"codigo": codigo, "mensaje": mensaje, "track_id": contexto.obtener().track_id}
    if extra:
        cuerpo.update(extra)
    return JSONResponse(cuerpo, status_code=estado, headers=cabeceras)


def registrar_manejadores(app: FastAPI) -> None:
    @app.exception_handler(e.ErrorDeDominio)
    async def _dominio(_: Request, exc: e.ErrorDeDominio):
        estado = _ESTADO.get(type(exc), 400)
        cab = {"WWW-Authenticate": "Bearer"} if estado == 401 else None
        return _respuesta(estado, exc.codigo, str(exc), cabeceras=cab)

    @app.exception_handler(RequestValidationError)
    async def _validacion(_: Request, exc: RequestValidationError):
        # Solo ubicación y tipo del error: FastAPI incluiría 'input' (p. ej. la contraseña).
        campos = [{"campo": ".".join(str(p) for p in err["loc"][1:]), "error": err["type"]} for err in exc.errors()]
        return _respuesta(422, "payload_invalido", "El payload no es válido.", {"errores": campos})

    @app.exception_handler(HTTPException)
    async def _http(_: Request, exc: HTTPException):
        return _respuesta(exc.status_code, f"http_{exc.status_code}", str(exc.detail), cabeceras=exc.headers)

    @app.exception_handler(Exception)
    async def _inesperado(_: Request, exc: Exception):
        _log.error("error_inesperado", extra={"tipo": type(exc).__name__})
        return _respuesta(500, "error_interno", "Error interno. Reporte el trackId.")
