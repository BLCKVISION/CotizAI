"""Interceptores (middleware ASGI): trazabilidad con trackId/ip y cabeceras de seguridad."""

from __future__ import annotations

import json
import logging
import re
import time
import uuid
from typing import Any

from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from evaluador.observabilidad import contexto
from evaluador.observabilidad.censura import censurar, censurar_cabeceras

_log = logging.getLogger("evaluador.http")
_TRACK_ID_VALIDO = re.compile(r"^[A-Za-z0-9-]{8,64}$")
_CABECERAS_A_LOGUEAR = {"user-agent", "content-type", "content-length", "authorization", "cookie", "origin"}


class InterceptorDeTrazabilidad:
    """Asigna trackId (o respeta uno válido del cliente), fija el contexto y registra cada petición.

    El cuerpo se lee con tope de tamaño, se parsea como JSON y se censura antes de loguear.
    """

    def __init__(self, app: ASGIApp, *, confiar_en_proxy: bool, max_bytes: int) -> None:
        self.app = app
        self._confiar_en_proxy = confiar_en_proxy
        self._max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        cab = Headers(scope=scope)
        entrante = cab.get("x-track-id", "")
        track_id = entrante if _TRACK_ID_VALIDO.match(entrante) else str(uuid.uuid4())
        contexto.iniciar(track_id=track_id, ip=self._ip(scope, cab))

        inicio = time.perf_counter()
        cuerpo = bytearray()
        estado = 500
        excedido = False

        async def receive_limitado() -> Message:
            nonlocal excedido
            mensaje = await receive()
            if mensaje["type"] == "http.request":
                if len(cuerpo) + len(mensaje.get("body", b"")) > self._max_bytes:
                    excedido = True
                    return {"type": "http.disconnect"}
                cuerpo.extend(mensaje.get("body", b""))
            return mensaje

        async def send_con_cabeceras(mensaje: Message) -> None:
            nonlocal estado
            if mensaje["type"] == "http.response.start":
                estado = mensaje["status"]
                MutableHeaders(scope=mensaje)["X-Track-Id"] = track_id
            await send(mensaje)

        try:
            await self.app(scope, receive_limitado, send_con_cabeceras)
        finally:
            _log.info(
                "http_solicitud",
                extra={
                    "metodo": scope["method"],
                    "ruta": scope["path"],
                    "estado": estado,
                    "duracion_ms": round((time.perf_counter() - inicio) * 1000, 1),
                    "cabeceras": censurar_cabeceras({k: v for k, v in cab.items() if k in _CABECERAS_A_LOGUEAR}),
                    "cuerpo": self._cuerpo_censurado(bytes(cuerpo), excedido),
                },
            )

    def _ip(self, scope: Scope, cab: Headers) -> str:
        if self._confiar_en_proxy:
            reenviado = cab.get("x-forwarded-for", "").split(",")[0].strip()
            if reenviado:
                return reenviado[:45]
        cliente = scope.get("client")
        return cliente[0] if cliente else "-"

    @staticmethod
    def _cuerpo_censurado(cuerpo: bytes, excedido: bool) -> Any:
        if excedido:
            return "<excede_tamano_maximo>"
        if not cuerpo:
            return None
        try:
            return censurar(json.loads(cuerpo))
        except (ValueError, UnicodeDecodeError):
            return "<no_json>"


class InterceptorDeSeguridad:
    """Cabeceras de seguridad en toda respuesta de la API."""

    def __init__(self, app: ASGIApp, *, produccion: bool) -> None:
        self.app = app
        self._produccion = produccion

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_seguro(mensaje: Message) -> None:
            if mensaje["type"] == "http.response.start":
                h = MutableHeaders(scope=mensaje)
                h["X-Content-Type-Options"] = "nosniff"
                h["X-Frame-Options"] = "DENY"
                h["Referrer-Policy"] = "no-referrer"
                h["Cache-Control"] = "no-store"
                h["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
                if self._produccion:
                    h["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
            await send(mensaje)

        await self.app(scope, receive, send_seguro)
