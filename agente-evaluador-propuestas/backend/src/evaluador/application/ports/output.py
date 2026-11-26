"""Puertos de salida: capacidades que la aplicación necesita, sin nombrar tecnologías."""

from __future__ import annotations

from datetime import datetime
from typing import Protocol

from evaluador.domain.identity import Session, Tenant, User
from evaluador.domain.project import Project

# Aislamiento multi-tenant: todo método de lectura recibe tenant_id y el adaptador DEBE filtrar por él.


class TenantRepository(Protocol):
    def by_id(self, tenant_id: str) -> Tenant | None: ...
    def by_code(self, code: str) -> Tenant | None: ...
    def save(self, tenant: Tenant) -> None: ...


class UserRepository(Protocol):
    def by_email(self, email: str) -> User | None:
        """El correo es único en todo el sistema: de él se deduce el tenant del usuario."""
        ...

    def by_id(self, tenant_id: str, user_id: str) -> User | None: ...
    def save(self, user: User) -> None: ...


class SessionRepository(Protocol):
    def by_token_hash(self, token_hash: str) -> Session | None: ...
    def save(self, session: Session) -> None: ...


class ProjectRepository(Protocol):
    def save(self, project: Project) -> None: ...
    def by_id(self, tenant_id: str, project_id: str) -> Project | None: ...
    def list_all(self, tenant_id: str) -> list[Project]: ...


class PasswordHasher(Protocol):
    def hash(self, password: str) -> str: ...
    def verify(self, stored_hash: str, password: str) -> bool: ...
    def verify_dummy(self, password: str) -> None:
        """Gasta el mismo tiempo que una verificación real (anti enumeración por tiempo)."""

    def requires_rehash(self, stored_hash: str) -> bool: ...


class TokenGenerator(Protocol):
    def new(self) -> str: ...
    def fingerprint(self, token: str) -> str:
        """Huella irreversible: en el almacén solo se guarda la huella, nunca el token."""


class IdGenerator(Protocol):
    def new(self) -> str: ...


class Clock(Protocol):
    def now(self) -> datetime: ...


class Audit(Protocol):
    """Traza de negocio. El contexto de la petición (trackId, ip, sesión) lo aporta el adaptador."""

    def register(self, *, tenant_id: str | None, actor: str | None, action: str, detail: str = "") -> None: ...
