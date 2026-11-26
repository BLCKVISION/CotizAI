"""Repositorios en memoria (pruebas y desarrollo). Aíslan por tenant igual que lo hará el adaptador SQL."""

from __future__ import annotations

from evaluador.domain.identity import Session, Tenant, User
from evaluador.domain.project import Project


class InMemoryTenants:
    def __init__(self) -> None:
        self._by_code: dict[str, Tenant] = {}

    def by_id(self, tenant_id: str) -> Tenant | None:
        return next((t for t in self._by_code.values() if t.id == tenant_id), None)

    def by_code(self, code: str) -> Tenant | None:
        return self._by_code.get(code)

    def save(self, tenant: Tenant) -> None:
        self._by_code[tenant.code] = tenant


class InMemoryUsers:
    def __init__(self) -> None:
        self._data: dict[tuple[str, str], User] = {}  # (tenant_id, usuario_id)

    def by_email(self, email: str) -> User | None:
        return next((u for u in self._data.values() if u.email == email), None)

    def by_id(self, tenant_id: str, user_id: str) -> User | None:
        return self._data.get((tenant_id, user_id))

    def save(self, user: User) -> None:
        existing = self.by_email(user.email)
        if existing is not None and existing.id != user.id:
            raise ValueError("El correo ya está registrado.")  # unicidad global: define el tenant en el login
        self._data[(user.tenant_id, user.id)] = user


class InMemorySessions:
    def __init__(self) -> None:
        self._by_fingerprint: dict[str, Session] = {}

    def by_token_hash(self, token_hash: str) -> Session | None:
        return self._by_fingerprint.get(token_hash)

    def save(self, session: Session) -> None:
        self._by_fingerprint[session.token_hash] = session


class InMemoryProjects:
    def __init__(self) -> None:
        self._data: dict[tuple[str, str], Project] = {}

    def save(self, project: Project) -> None:
        self._data[(project.tenant_id, project.id)] = project

    def by_id(self, tenant_id: str, project_id: str) -> Project | None:
        return self._data.get((tenant_id, project_id))

    def list_all(self, tenant_id: str) -> list[Project]:
        return sorted((p for (t, _), p in self._data.items() if t == tenant_id), key=lambda p: p.created, reverse=True)
