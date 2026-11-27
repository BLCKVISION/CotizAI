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

from evaluador.application.use_cases.transcription import MAX_IMAGE_BYTES
from evaluador.domain.gestion import MAX_BYTES_DOCUMENTO
from evaluador.observabilidad import contexto
from evaluador.observabilidad.censura import censurar, censurar_cabeceras

_log = logging.getLogger("evaluador.http")
_TRACK_ID_VALIDO = re.compile(r"^[A-Za-z0-9-]{8,64}$")
_RUTA_DE_CARGA = re.compile(r"^/api/v1/proyectos/[0-9a-fA-F-]{36}/propuestas$")
_TRANSCRIPTION_PATH = "/api/v1/transcriptions"
_RUTAS_DE_DOCUMENTACION = ("/api/docs", "/api/openapi.json")


def cabeceras_de_seguridad(*, produccion: bool, ruta: str = "") -> dict[str, str]:
    """Cabeceras para toda respuesta de la API (también las de error 500, que no pasan por el interceptor)."""
    h = {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "no-referrer",
        "Cache-Control": "no-store",
    }
    # Swagger UI necesita scripts propios: la CSP estricta solo se relaja en la documentación fuera de producción.
    if produccion or not ruta.startswith(_RUTAS_DE_DOCUMENTACION):
        h["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
    if produccion:
        h["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    return h


_CABECERAS_A_LOGUEAR = {"user-agent", "content-type", "content-length", "authorization", "cookie", "origin"}


class InterceptorDeTrazabilidad:
    """Asigna trackId (o respeta uno válido del cliente), fija el contexto y registra cada petición.

    El cuerpo se lee con tope de tamaño, se parsea como JSON y se censura antes de loguear.
    """

    def __init__(self, app: ASGIApp, *, confiar_en_proxy: bool, max_bytes: int, produccion: bool = False) -> None:
        self.app = app
        self._produccion = produccion
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
        # Solo las cargas de archivos admiten cuerpos grandes; su contenido nunca se registra.
        upload_limit = self._upload_limit(scope)
        es_carga = upload_limit is not None
        max_bytes = upload_limit or self._max_bytes
        cuerpo = bytearray()
        estado = 500
        excedido = False

        async def receive_limitado() -> Message:
            nonlocal excedido
            mensaje = await receive()
            if mensaje["type"] == "http.request":
                if len(cuerpo) + len(mensaje.get("body", b"")) > max_bytes:
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

        declarado = cab.get("content-length", "")
        demasiado_grande = declarado.isdigit() and int(declarado) > max_bytes
        try:
            if demasiado_grande:
                excedido = True
                respuesta = JSONResponse(
                    {"codigo": "payload_demasiado_grande", "mensaje": "El cuerpo excede el tamaño máximo.",
                     "track_id": track_id},
                    status_code=413,
                    headers=cabeceras_de_seguridad(produccion=self._produccion, ruta=scope["path"]),
                )  # fmt: skip
                await respuesta(scope, receive, send_con_cabeceras)
            else:
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
                    "cuerpo": "<documento>" if es_carga else self._cuerpo_censurado(bytes(cuerpo), excedido),
                },
            )

    @staticmethod
    def _upload_limit(scope: Scope) -> int | None:
        if scope["method"] != "POST":
            return None
        if scope["path"] == _TRANSCRIPTION_PATH:
            return MAX_IMAGE_BYTES
        return MAX_BYTES_DOCUMENTO if _RUTA_DE_CARGA.match(scope["path"]) else None

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
                for nombre, valor in cabeceras_de_seguridad(produccion=self._produccion, ruta=scope["path"]).items():
                    h[nombre] = valor
            await send(mensaje)

        await self.app(scope, receive, send_seguro)
