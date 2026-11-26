"""Contexto de trazabilidad por petición (contextvars): trackId, ip, sesión, tenant y usuario."""

from __future__ import annotations

from contextvars import ContextVar
from dataclasses import dataclass, replace


@dataclass(frozen=True, slots=True)
class ContextoDeSolicitud:
    track_id: str = "-"
    ip: str = "-"
    sesion_id: str = "-"
    tenant_id: str = "-"
    usuario_id: str = "-"


_contexto: ContextVar[ContextoDeSolicitud] = ContextVar(
    "contexto_de_solicitud",
    default=ContextoDeSolicitud(),  # noqa: B039 - dataclass frozen: inmutable, seguro como valor por defecto
)


def obtener() -> ContextoDeSolicitud:
    return _contexto.get()


def iniciar(*, track_id: str, ip: str) -> None:
    _contexto.set(ContextoDeSolicitud(track_id=track_id, ip=ip))


def enriquecer(**campos: str) -> None:
    """Añade sesión/tenant/usuario cuando el guard de autenticación los conoce."""
    _contexto.set(replace(_contexto.get(), **campos))
