"""Contexto de trazabilidad por petición (contextvars): trackId, ip, sesión, tenant y usuario."""

from __future__ import annotations

from contextvars import ContextVar
from dataclasses import dataclass, replace


@dataclass(frozen=True, slots=True)
class RequestContext:
    track_id: str = "-"
    ip: str = "-"
    session_id: str = "-"
    tenant_id: str = "-"
    user_id: str = "-"


_context: ContextVar[RequestContext] = ContextVar(
    "request_context",
    default=RequestContext(),  # noqa: B039 - dataclass frozen: inmutable, seguro como valor por defecto
)


def get() -> RequestContext:
    return _context.get()


def start(*, track_id: str, ip: str) -> None:
    _context.set(RequestContext(track_id=track_id, ip=ip))


def enrich(**fields: str) -> None:
    """Añade sesión/tenant/usuario cuando el guard de autenticación los conoce."""
    _context.set(replace(_context.get(), **fields))
