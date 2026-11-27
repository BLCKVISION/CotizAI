"""Dependencias que comparten la API y el worker: repositorios (memoria o SQL), almacén de documentos y los
adaptadores pequeños que unen los casos de uso entre sí (informes, chat)."""

from __future__ import annotations

import threading
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from evaluador.adapters.outbound.memory.audit_trail import InMemoryAuditTrail
from evaluador.adapters.outbound.memory.file_store import InMemoryFileStore
from evaluador.adapters.outbound.memory.jobs import InMemoryJobEvents, InMemoryJobs, InMemoryResults
from evaluador.adapters.outbound.memory.proposals import InMemoryProposals
from evaluador.adapters.outbound.memory.repositories import (
    InMemoryProjects,
    InMemorySessions,
    InMemoryTenants,
    InMemoryUsers,
)
from evaluador.adapters.outbound.memory.reviews import InMemoryReviews
from evaluador.adapters.outbound.memory.suppliers import InMemorySuppliers
from evaluador.adapters.outbound.storage.encrypted_store import EncryptedFileStore, load_key
from evaluador.application.ports.documents import ReadContent
from evaluador.application.ports.workflow import (
    AuditTrailRepository,
    FileStore,
    JobEventRepository,
    JobRepository,
    ProposalRepository,
    ResultRepository,
    ReviewRepository,
    SupplierRepository,
)
from evaluador.application.use_cases.evaluation_lookup import EvaluationLookup
from evaluador.composition.settings import Settings
from evaluador.domain.errors import ServiceUnavailable
from evaluador.domain.result import ResultOut


@dataclass(frozen=True, slots=True)
class Repositories:
    tenants: Any
    users: Any
    sessions: Any
    projects: Any
    proposals: ProposalRepository
    jobs: JobRepository
    job_events: JobEventRepository
    results: ResultRepository
    audit_trail: AuditTrailRepository
    suppliers: SupplierRepository
    reviews: ReviewRepository
    files: FileStore


def _file_store(config: Settings | None) -> FileStore:
    if config is not None and config.store_key is not None and config.store_key.get_secret_value():
        return EncryptedFileStore(config.documents_dir, load_key(config.store_key.get_secret_value()))
    return InMemoryFileStore()  # sin clave no se escribe nada a disco: los documentos viven en memoria


def build_repositories(config: Settings | None = None) -> Repositories:
    """Memoria por defecto; con `persistence="sql"` aplica las migraciones y usa la base de `database_url`."""
    files = _file_store(config)
    if config is not None and config.persistence.strip().lower() == "sql":
        from evaluador.adapters.outbound.persistence.sql.factory import build_sql_repositories, run_migrations

        url = config.database_url.get_secret_value()
        run_migrations(url)
        s = build_sql_repositories(url)
        return Repositories(
            tenants=s.tenants, users=s.users, sessions=s.sessions, projects=s.projects, proposals=s.proposals,
            jobs=s.jobs, job_events=s.job_events, results=s.results, audit_trail=s.audit_trail,
            suppliers=s.suppliers, reviews=s.reviews, files=files,
        )  # fmt: skip
    return Repositories(
        tenants=InMemoryTenants(), users=InMemoryUsers(), sessions=InMemorySessions(), projects=InMemoryProjects(),
        proposals=InMemoryProposals(), jobs=InMemoryJobs(), job_events=InMemoryJobEvents(), results=InMemoryResults(),
        audit_trail=InMemoryAuditTrail(), suppliers=InMemorySuppliers(), reviews=InMemoryReviews(), files=files,
    )  # fmt: skip


class ResultSource:
    """Resultado de una evaluación ya validado como `ResultOut`, o None si aún no existe."""

    def __init__(self, results: ResultRepository) -> None:
        self._results = results

    def get(self, tenant_id: str, job_id: str) -> ResultOut | None:
        stored = self._results.get(tenant_id, job_id)
        return ResultOut.model_validate(stored) if stored else None


class ProjectNames:
    def __init__(self, projects: Any) -> None:
        self._projects = projects

    def name_of(self, tenant_id: str, project_id: str) -> str | None:
        project = self._projects.by_id(tenant_id, project_id)
        return project.name if project else None


class EvaluationSources:
    """Las propuestas de una evaluación y su texto, para el chat: lee el archivo con el mismo lector del lote."""

    def __init__(
        self,
        jobs: JobRepository,
        lookup: EvaluationLookup,
        proposals: ProposalRepository,
        files: FileStore,
        read: Callable[[str, bytes], ReadContent],
    ) -> None:
        self._jobs, self._lookup, self._proposals, self._files, self._read = jobs, lookup, proposals, files, read

    def list(self, tenant_id: str, job_id: str) -> list[tuple[str, str]] | None:
        job = self._jobs.by_id(tenant_id, job_id)
        if job is None:
            return None
        evaluated = self._lookup.proposal_ids(tenant_id, job_id) or set()
        found = self._proposals.list_for_project(tenant_id, job.project_id)
        return [(p.id, p.filename) for p in found if not evaluated or p.id in evaluated]

    def text(self, tenant_id: str, proposal_id: str) -> str:
        proposal = self._proposals.by_id(tenant_id, proposal_id)
        if proposal is None:
            return ""
        return self._read(proposal.filename, self._files.get(tenant_id, proposal.storage_key)).text


class ChatUnavailable:
    """Sustituye al chat cuando no hay modelo de lenguaje: responde «servicio no disponible» en vez de 500."""

    def execute(self, *_args: object, **_kwargs: object) -> Any:
        raise ServiceUnavailable("El chat requiere un modelo de lenguaje configurado.")


class LazyEmbedder:
    """Embebedor que descarga/carga su modelo al primer uso: arrancar la API no debe depender de esa descarga."""

    dimension = 384

    def __init__(self, model: str, cache_dir: str | None) -> None:
        self._args = (model, cache_dir)
        self._inner: Any = None
        self._lock = threading.Lock()

    def _get(self) -> Any:
        with self._lock:
            if self._inner is None:
                from evaluador.adapters.outbound.ai.fastembed_embedder import FastEmbedEmbedder

                self._inner = FastEmbedEmbedder(*self._args)
            return self._inner

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return self._get().embed_documents(texts)  # type: ignore[no-any-return]

    def embed_query(self, text: str) -> list[float]:
        return self._get().embed_query(text)  # type: ignore[no-any-return]
