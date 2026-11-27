"""Puertos de salida: capacidades que la aplicación necesita, sin nombrar tecnologías."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from evaluador.domain.identidad import Sesion, Tenant, Usuario
from evaluador.domain.proyecto import Proyecto

# Aislamiento multi-tenant: todo método de lectura recibe tenant_id y el adaptador DEBE filtrar por él.


class TenantRepositorio(Protocol):
    def por_id(self, tenant_id: str) -> Tenant | None: ...
    def por_codigo(self, codigo: str) -> Tenant | None: ...
    def guardar(self, tenant: Tenant) -> None: ...


class UsuarioRepositorio(Protocol):
    def por_correo(self, correo: str) -> Usuario | None:
        """El correo es único en todo el sistema: de él se deduce el tenant del usuario."""
        ...

    def por_id(self, tenant_id: str, usuario_id: str) -> Usuario | None: ...
    def guardar(self, usuario: Usuario) -> None: ...


class SesionRepositorio(Protocol):
    def por_token_hash(self, token_hash: str) -> Sesion | None: ...
    def guardar(self, sesion: Sesion) -> None: ...


class ProyectoRepositorio(Protocol):
    def guardar(self, proyecto: Proyecto) -> None: ...
    def por_id(self, tenant_id: str, proyecto_id: str) -> Proyecto | None: ...
    def listar(self, tenant_id: str) -> list[Proyecto]: ...
    def eliminar(self, tenant_id: str, proyecto_id: str) -> None: ...


class HasheadorDeContrasenas(Protocol):
    def hashear(self, contrasena: str) -> str: ...
    def verificar(self, hash_almacenado: str, contrasena: str) -> bool: ...
    def verificar_ficticio(self, contrasena: str) -> None:
        """Gasta el mismo tiempo que una verificación real (anti enumeración por tiempo)."""

    def requiere_rehash(self, hash_almacenado: str) -> bool: ...


@dataclass(frozen=True, slots=True)
class TokenClaims:
    """What a signed session token states about its bearer."""

    user_id: str
    tenant_id: str
    session_id: str
    role: str
    issued_at: datetime
    expires_at: datetime


class GeneradorDeTokens(Protocol):
    def issue(self, claims: TokenClaims) -> str: ...
    def verify(self, token: str, now: datetime) -> TokenClaims:
        """Raises SesionInvalida when the token is forged, altered or expired."""

    def huella(self, token: str) -> str:
        """Huella irreversible: en el almacén solo se guarda la huella, nunca el token."""


class GeneradorDeIds(Protocol):
    def nuevo(self) -> str: ...


class Reloj(Protocol):
    def ahora(self) -> datetime: ...


class Auditoria(Protocol):
    """Traza de negocio. El contexto de la petición (trackId, ip, sesión) lo aporta el adaptador."""

    def registrar(self, *, tenant_id: str | None, actor: str | None, accion: str, detalle: str = "") -> None: ...
