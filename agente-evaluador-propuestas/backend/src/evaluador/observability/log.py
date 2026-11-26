"""Logs estructurados en JSON, una línea por evento, con el contexto de trazabilidad inyectado."""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import Any

from . import context
from .redaction import redact

_RESERVED = set(logging.LogRecord("", 0, "", 0, "", (), None).__dict__) | {"message", "asctime"}


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        ctx = context.get()
        event: dict[str, Any] = {
            "ts": datetime.fromtimestamp(record.created, UTC).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "trackId": ctx.track_id,
            "ip": ctx.ip,
            "sessionId": ctx.session_id,
            "tenantId": ctx.tenant_id,
            "userId": ctx.user_id,
        }
        extras = {k: v for k, v in record.__dict__.items() if k not in _RESERVED}
        if extras:
            event["data"] = redact(extras)  # defensa en profundidad: todo extra pasa por censura
        if record.exc_info:
            event["error"] = record.exc_info[0].__name__ if record.exc_info[0] else "Error"
        return json.dumps(event, ensure_ascii=False, default=str)


def configure_logs(level: str = "INFO") -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level.upper())
    # El log de acceso de uvicorn no pasa por la censura; lo reemplaza nuestro interceptor.
    logging.getLogger("uvicorn.access").disabled = True
