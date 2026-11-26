from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Request, status

from evaluador.adapters.inbound.http.dtos import ID_PATTERN, CreateProjectDto, ProjectResponse, TransitionDto
from evaluador.adapters.inbound.http.guards import require
from evaluador.application.use_cases.authentication import AuthenticatedSession
from evaluador.domain.identity import Permission

router = APIRouter(prefix="/projects", tags=["projects"])
ProjectId = Annotated[str, Path(pattern=ID_PATTERN)]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_project(
    dto: CreateProjectDto,
    request: Request,
    session: Annotated[AuthenticatedSession, Depends(require(Permission.CREATE_PROJECT))],
) -> ProjectResponse:
    p = request.app.state.container.create_project.execute(session.user, **dto.model_dump())
    return ProjectResponse.from_domain(p)


@router.get("")
def list_projects(
    request: Request, session: Annotated[AuthenticatedSession, Depends(require(Permission.VIEW_STATE))]
) -> list[ProjectResponse]:
    ps = request.app.state.container.list_projects.execute(session.user)
    return [ProjectResponse.from_domain(p) for p in ps]


@router.get("/{project_id}")
def get_project(
    project_id: ProjectId,
    request: Request,
    session: Annotated[AuthenticatedSession, Depends(require(Permission.VIEW_STATE))],
) -> ProjectResponse:
    return ProjectResponse.from_domain(request.app.state.container.get_project.execute(session.user, project_id))


@router.post("/{project_id}/transitions")
def transition_project(
    project_id: ProjectId,
    dto: TransitionDto,
    request: Request,
    session: Annotated[AuthenticatedSession, Depends(require(Permission.VIEW_STATE))],
) -> ProjectResponse:
    """El permiso fino depende del destino y lo aplica el caso de uso."""
    p = request.app.state.container.transition_project.execute(session.user, project_id, dto.target, dto.reason)
    return ProjectResponse.from_domain(p)
