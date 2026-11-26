"""Casos de uso de proyectos. Autorización y aislamiento por tenant se aplican aquí, no en HTTP."""

from __future__ import annotations

from decimal import Decimal

from evaluador.application.ports.output import Audit, Clock, IdGenerator, ProjectRepository
from evaluador.domain.errors import NotFound
from evaluador.domain.identity import Permission, User
from evaluador.domain.project import PERMISSION_BY_TARGET, Project, ProjectState


class CreateProject:
    def __init__(self, projects: ProjectRepository, ids: IdGenerator, clock: Clock, audit: Audit) -> None:
        self._projects = projects
        self._ids = ids
        self._clock = clock
        self._audit = audit

    def execute(
        self,
        actor: User,
        *,
        name: str,
        requirement: str,
        location: str,
        reference_budget: Decimal | None,
    ) -> Project:
        actor.require(Permission.CREATE_PROJECT)
        project = Project.create(
            id=self._ids.new(),
            tenant_id=actor.tenant_id,  # siempre el del actor, nunca el del cliente
            name=name,
            requirement=requirement,
            location=location,
            reference_budget=reference_budget,
            created_by=actor.id,
            now=self._clock.now(),
        )
        self._projects.save(project)
        self._audit.register(tenant_id=actor.tenant_id, actor=actor.id, action="project_created", detail=project.id)
        return project


class ListProjects:
    def __init__(self, projects: ProjectRepository) -> None:
        self._projects = projects

    def execute(self, actor: User) -> list[Project]:
        actor.require(Permission.VIEW_STATE)
        return self._projects.list_all(actor.tenant_id)


class GetProject:
    def __init__(self, projects: ProjectRepository) -> None:
        self._projects = projects

    def execute(self, actor: User, project_id: str) -> Project:
        actor.require(Permission.VIEW_STATE)
        project = self._projects.by_id(actor.tenant_id, project_id)
        if project is None:  # también cubre "existe pero es de otro tenant": mismo 404
            raise NotFound("Proyecto no encontrado.")
        return project


class TransitionProject:
    def __init__(self, projects: ProjectRepository, audit: Audit) -> None:
        self._projects = projects
        self._audit = audit

    def execute(self, actor: User, project_id: str, target: ProjectState, reason: str | None) -> Project:
        actor.require(PERMISSION_BY_TARGET[target])
        project = self._projects.by_id(actor.tenant_id, project_id)
        if project is None:
            raise NotFound("Proyecto no encontrado.")
        new = project.transition(target, reason)
        self._projects.save(new)
        self._audit.register(
            tenant_id=actor.tenant_id,
            actor=actor.id,
            action="project_transition",
            detail=f"{project.id}:{project.state}->{target}",
        )
        return new
