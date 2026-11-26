"""Interceptores (middleware ASGI): trazabilidad con trackId/ip y cabeceras de seguridad."""

from __future__ import annotations

import json
import logging
import re
import time
import uuid
from typing import Any

from starlette.datastructures import Headers, MutableHeaders
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from evaluador.observability import context
from evaluador.observability.redaction import redact, redact_headers

_log = logging.getLogger("evaluador.http")
_VALID_TRACK_ID = re.compile(r"^[A-Za-z0-9-]{8,64}$")
_DOCS_PATHS = ("/api/docs", "/api/openapi.json")


def security_headers(*, production: bool, path: str = "") -> dict[str, str]:
    """Cabeceras para toda respuesta de la API (también las de error 500, que no pasan por el interceptor)."""
    h = {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "no-referrer",
        "Cache-Control": "no-store",
    }
    # Swagger UI necesita scripts propios: la CSP estricta solo se relaja en la documentación fuera de producción.
    if production or not path.startswith(_DOCS_PATHS):
        h["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
    if production:
        h["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    return h


_HEADERS_TO_LOG = {"user-agent", "content-type", "content-length", "authorization", "cookie", "origin"}


class TraceabilityInterceptor:
    """Asigna trackId (o respeta uno válido del cliente), fija el contexto y registra cada petición.

    El cuerpo se lee con tope de tamaño, se parsea como JSON y se censura antes de loguear.
    """

    def __init__(self, app: ASGIApp, *, trust_proxy: bool, max_bytes: int, production: bool = False) -> None:
        self.app = app
        self._production = production
        self._trust_proxy = trust_proxy
        self._max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        hdr = Headers(scope=scope)
        incoming = hdr.get("x-track-id", "")
        track_id = incoming if _VALID_TRACK_ID.match(incoming) else str(uuid.uuid4())
        context.start(track_id=track_id, ip=self._ip(scope, hdr))

        start = time.perf_counter()
        body = bytearray()
        status = 500
        exceeded = False

        async def receive_limited() -> Message:
            nonlocal exceeded
            message = await receive()
            if message["type"] == "http.request":
                if len(body) + len(message.get("body", b"")) > self._max_bytes:
                    exceeded = True
                    return {"type": "http.disconnect"}
                body.extend(message.get("body", b""))
            return message

        async def send_with_headers(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                MutableHeaders(scope=message)["X-Track-Id"] = track_id
            await send(message)

        declared = hdr.get("content-length", "")
        too_large = declared.isdigit() and int(declared) > self._max_bytes
        try:
            if too_large:
                exceeded = True
                response = JSONResponse(
                    {"code": "payload_too_large", "message": "El cuerpo excede el tamaño máximo.",
                     "track_id": track_id},
                    status_code=413,
                    headers=security_headers(production=self._production, path=scope["path"]),
                )  # fmt: skip
                await response(scope, receive, send_with_headers)
            else:
                await self.app(scope, receive_limited, send_with_headers)
        finally:
            _log.info(
                "http_request",
                extra={
                    "method": scope["method"],
                    "path": scope["path"],
                    "status": status,
                    "duration_ms": round((time.perf_counter() - start) * 1000, 1),
                    "headers": redact_headers({k: v for k, v in hdr.items() if k in _HEADERS_TO_LOG}),
                    "body": self._redacted_body(bytes(body), exceeded),
                },
            )

    def _ip(self, scope: Scope, hdr: Headers) -> str:
        if self._trust_proxy:
            forwarded = hdr.get("x-forwarded-for", "").split(",")[0].strip()
            if forwarded:
                return forwarded[:45]
        client = scope.get("client")
        return client[0] if client else "-"

    @staticmethod
    def _redacted_body(body: bytes, exceeded: bool) -> Any:
        if exceeded:
            return "<excede_tamano_maximo>"
        if not body:
            return None
        try:
            return redact(json.loads(body))
        except (ValueError, UnicodeDecodeError):
            return "<no_json>"


class SecurityInterceptor:
    """Cabeceras de seguridad en toda respuesta de la API."""

    def __init__(self, app: ASGIApp, *, production: bool) -> None:
        self.app = app
        self._production = production

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def safe_send(message: Message) -> None:
            if message["type"] == "http.response.start":
                h = MutableHeaders(scope=message)
                for name, value in security_headers(production=self._production, path=scope["path"]).items():
                    h[name] = value
            await send(message)

        await self.app(scope, receive, safe_send)
