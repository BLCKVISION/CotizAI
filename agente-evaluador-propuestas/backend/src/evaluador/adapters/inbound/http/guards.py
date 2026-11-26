"""Guards: dependencias que autentican y autorizan antes de que la ruta se ejecute."""

from __future__ import annotations

from collections import defaultdict, deque
from threading import Lock
from time import monotonic
from typing import Annotated

from fastapi import Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool

from evaluador.application.use_cases.authentication import AuthenticatedSession
from evaluador.domain.errors import InvalidSession
from evaluador.domain.identity import Permission
from evaluador.observability import context


def header_token(request: Request) -> str:
    schema, _, value = request.headers.get("authorization", "").partition(" ")
    if schema.lower() != "bearer" or not value.strip():
        raise InvalidSession("Sesión inválida o expirada.")
    return value.strip()


async def current_session(request: Request, token: Annotated[str, Depends(header_token)]) -> AuthenticatedSession:
    """Guard de autenticación: resuelve el token y enriquece el contexto de trazabilidad.

    Es async a propósito: un guard síncrono corre en un hilo con una copia del contexto y sus cambios se perderían
    para el log de acceso y la auditoría. La consulta (síncrona) va al pool de hilos.
    """
    session = await run_in_threadpool(request.app.state.container.authenticate_token.execute, token)
    context.enrich(session_id=session.session_id, tenant_id=session.tenant_id, user_id=session.user.id)
    return session


def require(permission: Permission):
    """Guard de autorización por permiso. Los casos de uso lo vuelven a comprobar (defensa en profundidad)."""

    def _guard(session: Annotated[AuthenticatedSession, Depends(current_session)]) -> AuthenticatedSession:
        session.user.require(permission)
        return session

    return _guard


class WindowLimiter:
    """Límite por clave (ip) en ventana deslizante de 60 s. Suficiente para un solo proceso."""

    _MAX_KEYS = 10_000

    def __init__(self, max_per_minute: int) -> None:
        self._maximum = max_per_minute
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()  # las dependencias síncronas corren en varios hilos

    def verify(self, key: str) -> None:
        now = monotonic()
        with self._lock:
            if len(self._events) >= self._MAX_KEYS and key not in self._events:
                self._purge(now)
            queue = self._events[key]
            while queue and now - queue[0] > 60:
                queue.popleft()
            if len(queue) >= self._maximum:
                raise HTTPException(status_code=429, detail="Demasiados intentos.", headers={"Retry-After": "60"})
            queue.append(now)

    def _purge(self, now: float) -> None:
        for k in [k for k, c in self._events.items() if not c or now - c[-1] > 60]:
            del self._events[k]


def limit_login(request: Request) -> None:
    request.app.state.login_limiter.verify(context.get().ip)
