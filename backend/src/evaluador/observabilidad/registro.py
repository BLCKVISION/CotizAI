"""Logs estructurados en JSON, una línea por evento, con el contexto de trazabilidad inyectado."""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import Any

from . import contexto
from .censura import censurar

_RESERVADOS = set(logging.LogRecord("", 0, "", 0, "", (), None).__dict__) | {"message", "asctime"}


class FormateadorJson(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        ctx = contexto.obtener()
        evento: dict[str, Any] = {
            "ts": datetime.fromtimestamp(record.created, UTC).isoformat(timespec="milliseconds"),
            "nivel": record.levelname,
            "logger": record.name,
            "mensaje": record.getMessage(),
            "trackId": ctx.track_id,
            "ip": ctx.ip,
            "sesionId": ctx.sesion_id,
            "tenantId": ctx.tenant_id,
            "usuarioId": ctx.usuario_id,
        }
        extras = {k: v for k, v in record.__dict__.items() if k not in _RESERVADOS}
        if extras:
            evento["datos"] = censurar(extras)  # defensa en profundidad: todo extra pasa por censura
        if record.exc_info:
            evento["error"] = record.exc_info[0].__name__ if record.exc_info[0] else "Error"
        return json.dumps(evento, ensure_ascii=False, default=str)


def configurar_logs(nivel: str = "INFO") -> None:
    manejador = logging.StreamHandler()
    manejador.setFormatter(FormateadorJson())
    raiz = logging.getLogger()
    raiz.handlers[:] = [manejador]
    raiz.setLevel(nivel.upper())
    # El log de acceso de uvicorn no pasa por la censura; lo reemplaza nuestro interceptor.
    logging.getLogger("uvicorn.access").disabled = True
