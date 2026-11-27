"""Ingesta de propuestas: valida tipo real, tamaño y nombre; calcula SHA-256; guarda cifrado y audita.

El nombre sin extensión es el identificador de la propuesta en el ranking, por eso no puede repetirse en un proyecto.
"""

from __future__ import annotations

import hashlib
import unicodedata

from evaluador.adapters.outbound.extraction.reader import MAX_BYTES, detect_type, type_by_extension
from evaluador.application.ports.output import Audit, Clock, IdGenerator, ProjectRepository
from evaluador.application.ports.workflow import FileStore, ProposalRepository
from evaluador.domain.errors import InvalidData, InvalidTransition, NotFound, PayloadTooLarge
from evaluador.domain.identity import Permission, User
from evaluador.domain.project import Project, ProjectState
from evaluador.domain.workflow import Proposal

MAX_PROPOSALS_PER_PROJECT = 20
MAX_FILENAME_LENGTH = 120


def sanitize_filename(raw: str) -> str:
    """Solo el nombre base, sin separadores ni caracteres de control. Rechaza lo que no deja un nombre usable."""
    base = raw.replace("\\", "/").split("/")[-1]
    base = "".join(ch for ch in base if unicodedata.category(ch) != "Cc").strip()
    stem, dot, ext = base.rpartition(".")
    stem = stem.strip()
    if not dot or not stem or stem.startswith(".") or not ext:
        raise InvalidData("El nombre del archivo no es válido: necesita nombre y extensión.")
    if len(base) > MAX_FILENAME_LENGTH:
        raise InvalidData(f"El nombre del archivo excede {MAX_FILENAME_LENGTH} caracteres.")
    return f"{stem}.{ext}"


def _stem(filename: str) -> str:
    return filename.rpartition(".")[0].casefold()


def _open_project(projects: ProjectRepository, actor: User, project_id: str) -> Project:
    project = projects.by_id(actor.tenant_id, project_id)
    if project is None:  # también cubre «existe pero es de otro tenant»: mismo 404
        raise NotFound("Proyecto no encontrado.")
    return project


def _require_receiving(project: Project) -> None:
    if project.state is not ProjectState.RECEIVING:
        raise InvalidTransition("El proyecto ya no recibe propuestas.")


class UploadProposal:
    def __init__(
        self,
        projects: ProjectRepository,
        proposals: ProposalRepository,
        files: FileStore,
        ids: IdGenerator,
        clock: Clock,
        audit: Audit,
    ) -> None:
        self._projects, self._proposals, self._files = projects, proposals, files
        self._ids, self._clock, self._audit = ids, clock, audit

    def execute(self, actor: User, project_id: str, filename: str, data: bytes) -> Proposal:
        actor.require(Permission.LOAD_DOCUMENTS)
        _require_receiving(_open_project(self._projects, actor, project_id))
        name = sanitize_filename(filename)
        expected = type_by_extension(name)
        if expected is None:
            raise InvalidData("Tipo de archivo no admitido. Use PDF, XLSX, PNG, JPG o WEBP.")
        if not data:
            raise InvalidData("El archivo está vacío.")
        if len(data) > MAX_BYTES:
            raise PayloadTooLarge("El archivo excede el tamaño máximo de 25 MiB.")
        if detect_type(data) != expected:
            raise InvalidData("El contenido del archivo no corresponde a su extensión.")

        digest = hashlib.sha256(data).hexdigest()
        existing = self._proposals.list_for_project(actor.tenant_id, project_id)
        same = next((p for p in existing if p.sha256 == digest), None)
        if same is not None:  # idempotente: reintentar la misma carga no duplica
            return same
        if any(_stem(p.filename) == _stem(name) for p in existing):
            raise InvalidData(f"Ya existe una propuesta con el nombre «{name.rpartition('.')[0]}» en este proyecto.")
        if len(existing) >= MAX_PROPOSALS_PER_PROJECT:
            raise InvalidData(f"Un proyecto admite como máximo {MAX_PROPOSALS_PER_PROJECT} propuestas.")

        proposal = Proposal(
            id=self._ids.new(),
            tenant_id=actor.tenant_id,
            project_id=project_id,
            filename=name,
            sha256=digest,
            size_bytes=len(data),
            storage_key=self._ids.new(),  # opaca: no revela nombre ni proyecto
            uploaded_by=actor.id,
            created=self._clock.now(),
        )
        self._files.put(actor.tenant_id, proposal.storage_key, data)
        try:
            self._proposals.save(proposal)
        except BaseException:
            self._files.delete(actor.tenant_id, proposal.storage_key)  # no dejar archivos huérfanos
            raise
        self._audit.register(tenant_id=actor.tenant_id, actor=actor.id, action="proposal_uploaded", detail=proposal.id)
        return proposal


class ListProposals:
    def __init__(self, projects: ProjectRepository, proposals: ProposalRepository) -> None:
        self._projects, self._proposals = projects, proposals

    def execute(self, actor: User, project_id: str) -> list[Proposal]:
        actor.require(Permission.VIEW_STATE)
        _open_project(self._projects, actor, project_id)
        return self._proposals.list_for_project(actor.tenant_id, project_id)


class DeleteProposal:
    def __init__(
        self, projects: ProjectRepository, proposals: ProposalRepository, files: FileStore, audit: Audit
    ) -> None:
        self._projects, self._proposals, self._files, self._audit = projects, proposals, files, audit

    def execute(self, actor: User, project_id: str, proposal_id: str) -> None:
        actor.require(Permission.LOAD_DOCUMENTS)
        _require_receiving(_open_project(self._projects, actor, project_id))
        proposal = self._proposals.by_id(actor.tenant_id, proposal_id)
        if proposal is None or proposal.project_id != project_id:
            raise NotFound("Propuesta no encontrada.")
        self._files.delete(actor.tenant_id, proposal.storage_key)
        self._proposals.delete(actor.tenant_id, proposal.id)
        self._audit.register(tenant_id=actor.tenant_id, actor=actor.id, action="proposal_deleted", detail=proposal.id)
