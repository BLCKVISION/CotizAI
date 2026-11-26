"""Identidad, roles, permisos y sesiones. Sin dependencias externas."""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import datetime, timedelta
from enum import StrEnum

from .errors import PermissionDenied


class Role(StrEnum):
    LOADER = "loader"
    EVALUATOR = "evaluator"
    APPROVER = "approver"
    AUDITOR = "auditor"


class Permission(StrEnum):
    CREATE_PROJECT = "create_project"
    LOAD_DOCUMENTS = "load_documents"
    START_EVALUATION = "start_evaluation"
    VIEW_STATE = "view_state"
    VIEW_RESULTS = "view_results"
    ANNOTATE_REVIEW = "annotate_review"
    AWARD_OR_CLOSE = "award_or_close"
    VIEW_AUDIT = "view_audit"
    REGISTER_RATE = "register_rate"


# Matriz de la sección 4.1 del documento de arquitectura (mínimo privilegio).
PERMISSIONS_BY_ROLE: dict[Role, frozenset[Permission]] = {
    Role.LOADER: frozenset(
        {Permission.CREATE_PROJECT, Permission.LOAD_DOCUMENTS, Permission.START_EVALUATION, Permission.VIEW_STATE}
    ),
    Role.EVALUATOR: frozenset(
        {
            Permission.START_EVALUATION,
            Permission.VIEW_STATE,
            Permission.VIEW_RESULTS,
            Permission.ANNOTATE_REVIEW,
            Permission.REGISTER_RATE,
        }
    ),
    Role.APPROVER: frozenset(
        {Permission.VIEW_STATE, Permission.VIEW_RESULTS, Permission.ANNOTATE_REVIEW, Permission.AWARD_OR_CLOSE}
    ),
    Role.AUDITOR: frozenset({Permission.VIEW_STATE, Permission.VIEW_RESULTS, Permission.VIEW_AUDIT}),
}


@dataclass(frozen=True, slots=True)
class SessionPolicy:
    max_failed_attempts: int = 5
    lockout_minutes: int = 15
    inactivity_minutes: int = 30
    max_lifetime_hours: int = 8


@dataclass(frozen=True, slots=True)
class Tenant:
    """Organización aislada: sus usuarios, proyectos y sesiones no se ven con las de otra."""

    id: str
    code: str  # identificador público y estable para el login, p. ej. "ministerio-educacion"
    name: str
    active: bool = True


@dataclass(frozen=True, slots=True)
class User:
    id: str
    tenant_id: str
    email: str
    password_hash: str
    role: Role
    active: bool = True
    failed_attempts: int = 0
    blocked_until: datetime | None = None

    def is_blocked(self, now: datetime) -> bool:
        return self.blocked_until is not None and now < self.blocked_until

    def with_failure(self, now: datetime, policy: SessionPolicy) -> User:
        attempts = self.failed_attempts + 1
        if attempts >= policy.max_failed_attempts:
            return replace(
                self,
                failed_attempts=0,
                blocked_until=now + timedelta(minutes=policy.lockout_minutes),
            )
        return replace(self, failed_attempts=attempts)

    def with_success(self) -> User:
        return replace(self, failed_attempts=0, blocked_until=None)

    def with_hash(self, new_hash: str) -> User:
        return replace(self, password_hash=new_hash)

    def has(self, permission: Permission) -> bool:
        return permission in PERMISSIONS_BY_ROLE[self.role]

    def require(self, permission: Permission) -> None:
        if not self.has(permission):
            raise PermissionDenied(f"El rol '{self.role}' no tiene el permiso '{permission}'.")


@dataclass(frozen=True, slots=True)
class Session:
    id: str
    tenant_id: str
    user_id: str
    token_hash: str
    created: datetime
    expires: datetime
    last_activity: datetime
    revoked: bool = False

    def is_valid(self, now: datetime, policy: SessionPolicy) -> bool:
        if self.revoked or now >= self.expires:
            return False
        return now - self.last_activity < timedelta(minutes=policy.inactivity_minutes)

    def with_activity(self, now: datetime) -> Session:
        return replace(self, last_activity=now)

    def revoke(self) -> Session:
        return replace(self, revoked=True)
