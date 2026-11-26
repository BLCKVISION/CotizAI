"""Casos de uso de autenticación multi-tenant: iniciar sesión, validar token y cerrar sesión."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import NoReturn

from evaluador.application.ports.output import (
    Audit,
    Clock,
    IdGenerator,
    PasswordHasher,
    SessionRepository,
    TenantRepository,
    TokenGenerator,
    UserRepository,
)
from evaluador.domain.errors import InvalidCredentials, InvalidSession
from evaluador.domain.identity import Session, SessionPolicy, User


@dataclass(frozen=True, slots=True)
class SessionStarted:
    token: str
    session_id: str
    expires: datetime
    user: User


@dataclass(frozen=True, slots=True)
class AuthenticatedSession:
    session_id: str
    user: User

    @property
    def tenant_id(self) -> str:
        return self.user.tenant_id


class StartSession:
    def __init__(
        self,
        tenants: TenantRepository,
        users: UserRepository,
        sessions: SessionRepository,
        hasher: PasswordHasher,
        tokens: TokenGenerator,
        ids: IdGenerator,
        clock: Clock,
        audit: Audit,
        policy: SessionPolicy,
    ) -> None:
        self._tenants = tenants
        self._users = users
        self._sessions = sessions
        self._hasher = hasher
        self._tokens = tokens
        self._ids = ids
        self._clock = clock
        self._audit = audit
        self._policy = policy

    def execute(self, email: str, password: str) -> SessionStarted:
        now = self._clock.now()
        user = self._users.by_email(email.strip().lower())
        if user is None:
            self._reject(password, tenant_id=None, actor=None, reason="unknown_user")

        tenant = self._tenants.by_id(user.tenant_id)  # el tenant sale del usuario, nunca del cliente
        if tenant is None or not tenant.active:
            self._reject(password, tenant_id=user.tenant_id, actor=user.id, reason="inactive_organization")

        if not user.active or user.is_blocked(now):
            self._reject(password, tenant_id=tenant.id, actor=user.id, reason="inactive_or_blocked")

        if not self._hasher.verify(user.password_hash, password):
            self._users.save(user.with_failure(now, self._policy))
            self._audit.register(tenant_id=tenant.id, actor=user.id, action="login_failed", detail="wrong_password")
            raise InvalidCredentials("Credenciales inválidas.")

        user = user.with_success()
        if self._hasher.requires_rehash(user.password_hash):
            user = user.with_hash(self._hasher.hash(password))
        self._users.save(user)

        token = self._tokens.new()
        session = Session(
            id=self._ids.new(),
            tenant_id=tenant.id,
            user_id=user.id,
            token_hash=self._tokens.fingerprint(token),
            created=now,
            expires=now + timedelta(hours=self._policy.max_lifetime_hours),
            last_activity=now,
        )
        self._sessions.save(session)
        self._audit.register(tenant_id=tenant.id, actor=user.id, action="login_success", detail=session.id)
        return SessionStarted(token=token, session_id=session.id, expires=session.expires, user=user)

    def _reject(self, password: str, *, tenant_id: str | None, actor: str | None, reason: str) -> NoReturn:
        """Mismo mensaje y mismo coste de tiempo en todos los rechazos (sin enumeración)."""
        self._hasher.verify_dummy(password)
        self._audit.register(tenant_id=tenant_id, actor=actor, action="login_rejected", detail=reason)
        raise InvalidCredentials("Credenciales inválidas.")


class AuthenticateToken:
    """Resuelve el token a usuario, sesión y tenant; renueva la actividad (expiración deslizante)."""

    def __init__(
        self,
        tenants: TenantRepository,
        users: UserRepository,
        sessions: SessionRepository,
        tokens: TokenGenerator,
        clock: Clock,
        policy: SessionPolicy,
    ) -> None:
        self._tenants = tenants
        self._users = users
        self._sessions = sessions
        self._tokens = tokens
        self._clock = clock
        self._policy = policy

    def execute(self, token: str) -> AuthenticatedSession:
        now = self._clock.now()
        session = self._sessions.by_token_hash(self._tokens.fingerprint(token))
        if session is None or not session.is_valid(now, self._policy):
            raise InvalidSession("Sesión inválida o expirada.")
        tenant = self._tenants.by_id(session.tenant_id)
        user = self._users.by_id(session.tenant_id, session.user_id)
        if tenant is None or not tenant.active or user is None or not user.active:
            raise InvalidSession("Sesión inválida o expirada.")
        self._sessions.save(session.with_activity(now))
        return AuthenticatedSession(session_id=session.id, user=user)


class CloseSession:
    def __init__(self, sessions: SessionRepository, tokens: TokenGenerator, audit: Audit) -> None:
        self._sessions = sessions
        self._tokens = tokens
        self._audit = audit

    def execute(self, token: str) -> None:
        session = self._sessions.by_token_hash(self._tokens.fingerprint(token))
        if session is not None:
            self._sessions.save(session.revoke())
            self._audit.register(tenant_id=session.tenant_id, actor=session.user_id, action="logout", detail=session.id)
