"""Raíz de composición: único lugar que conoce adaptadores concretos y los inyecta en los casos de uso."""

from __future__ import annotations

from dataclasses import dataclass

from evaluador.adapters.outbound.memory.audit_log import AuditLog
from evaluador.adapters.outbound.memory.repositories import (
    InMemoryProjects,
    InMemorySessions,
    InMemoryTenants,
    InMemoryUsers,
)
from evaluador.adapters.outbound.security.argon2_hasher import Argon2Hasher
from evaluador.adapters.outbound.security.tokens import IdsUuid, SecureTokens, SystemClock
from evaluador.application.ports.agent import VisionModel
from evaluador.application.use_cases.authentication import AuthenticateToken, CloseSession, StartSession
from evaluador.application.use_cases.projects import (
    CreateProject,
    GetProject,
    ListProjects,
    TransitionProject,
)
from evaluador.application.use_cases.transcription import TranscribeImage
from evaluador.domain.identity import SessionPolicy


@dataclass(frozen=True, slots=True)
class Container:
    start_session: StartSession
    authenticate_token: AuthenticateToken
    close_session: CloseSession
    create_project: CreateProject
    list_projects: ListProjects
    get_project: GetProject
    transition_project: TransitionProject
    transcribe: TranscribeImage
    # Expuestos para scripts de semillas y pruebas
    tenants: InMemoryTenants
    users: InMemoryUsers
    hasher: Argon2Hasher
    ids: IdsUuid


def build_container(policy: SessionPolicy | None = None, vision: VisionModel | None = None) -> Container:
    """`vision` es el modelo que lee imágenes; sin él, transcribir responde «servicio no disponible» (503)."""
    policy = policy or SessionPolicy()
    clock, ids, tokens, hasher, audit = (
        SystemClock(),
        IdsUuid(),
        SecureTokens(),
        Argon2Hasher(),
        AuditLog(),
    )
    tenants, users, sessions, projects = (
        InMemoryTenants(), InMemoryUsers(), InMemorySessions(), InMemoryProjects()
    )  # fmt: skip
    return Container(
        start_session=StartSession(tenants, users, sessions, hasher, tokens, ids, clock, audit, policy),
        authenticate_token=AuthenticateToken(tenants, users, sessions, tokens, clock, policy),
        close_session=CloseSession(sessions, tokens, audit),
        create_project=CreateProject(projects, ids, clock, audit),
        list_projects=ListProjects(projects),
        get_project=GetProject(projects),
        transition_project=TransitionProject(projects, audit),
        transcribe=TranscribeImage(vision),
        tenants=tenants,
        users=users,
        hasher=hasher,
        ids=ids,
    )
