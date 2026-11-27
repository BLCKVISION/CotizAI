"""Guards: dependencias que autentican y autorizan antes de que la ruta se ejecute."""

from __future__ import annotations

from collections import defaultdict, deque
from collections.abc import Callable
from threading import Lock
from time import monotonic
from typing import Annotated

from fastapi import Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool

from evaluador.application.use_cases.autenticacion import SesionAutenticada
from evaluador.domain.errores import SesionInvalida
from evaluador.domain.identidad import Permiso
from evaluador.observabilidad import contexto


def token_de_cabecera(request: Request) -> str:
    esquema, _, valor = request.headers.get("authorization", "").partition(" ")
    if esquema.lower() != "bearer" or not valor.strip():
        raise SesionInvalida("Sesión inválida o expirada.")
    return valor.strip()


async def sesion_actual(request: Request, token: Annotated[str, Depends(token_de_cabecera)]) -> SesionAutenticada:
    """Guard de autenticación: resuelve el token y enriquece el contexto de trazabilidad.

    Es async a propósito: un guard síncrono corre en un hilo con una copia del contexto y sus cambios se perderían
    para el log de acceso y la auditoría. La consulta (síncrona) va al pool de hilos.
    """
    sesion: SesionAutenticada = await run_in_threadpool(request.app.state.contenedor.autenticar_token.ejecutar, token)
    contexto.enriquecer(sesion_id=sesion.sesion_id, tenant_id=sesion.tenant_id, usuario_id=sesion.usuario.id)
    return sesion


def exigir(permiso: Permiso) -> Callable[..., SesionAutenticada]:
    """Guard de autorización por permiso. Los casos de uso lo vuelven a comprobar (defensa en profundidad)."""

    def _guard(sesion: Annotated[SesionAutenticada, Depends(sesion_actual)]) -> SesionAutenticada:
        sesion.usuario.exigir(permiso)
        return sesion

    return _guard


class LimitadorDeVentana:
    """Límite por clave (ip) en ventana deslizante de 60 s. Suficiente para un solo proceso."""

    _MAX_CLAVES = 10_000

    def __init__(self, maximo_por_minuto: int) -> None:
        self._maximo = maximo_por_minuto
        self._eventos: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()  # las dependencias síncronas corren en varios hilos

    def verificar(self, clave: str) -> None:
        ahora = monotonic()
        with self._lock:
            if len(self._eventos) >= self._MAX_CLAVES and clave not in self._eventos:
                self._purgar(ahora)
            cola = self._eventos[clave]
            while cola and ahora - cola[0] > 60:
                cola.popleft()
            if len(cola) >= self._maximo:
                raise HTTPException(status_code=429, detail="Demasiados intentos.", headers={"Retry-After": "60"})
            cola.append(ahora)

    def _purgar(self, ahora: float) -> None:
        for k in [k for k, c in self._eventos.items() if not c or ahora - c[-1] > 60]:
            del self._eventos[k]


def limitar_login(request: Request) -> None:
    request.app.state.limitador_login.verificar(contexto.obtener().ip)
