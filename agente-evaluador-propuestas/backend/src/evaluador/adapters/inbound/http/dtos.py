"""DTOs de entrada y salida. Validación estricta en el borde: campos extra prohibidos, longitudes acotadas."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, SecretStr

from evaluador.domain.identity import Role, User
from evaluador.domain.project import Project, ProjectState

ID_PATTERN = r"^[0-9a-fA-F-]{36}$"


class InputDto(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, frozen=True)


class OutputDto(BaseModel):
    model_config = ConfigDict(frozen=True)


# ---------- Sesiones ----------
class StartSessionDto(InputDto):
    email: Annotated[str, Field(min_length=3, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")]
    password: Annotated[SecretStr, Field(min_length=1, max_length=128)]


class UserResponse(OutputDto):
    id: str
    email: str
    role: Role
    organization_id: str

    @classmethod
    def from_domain(cls, u: User) -> UserResponse:
        return cls(id=u.id, email=u.email, role=u.role, organization_id=u.tenant_id)


class SessionResponse(OutputDto):
    access_token: str
    token_type: str = "Bearer"  # noqa: S105 - nombre del esquema HTTP, no un secreto
    expires: datetime
    user: UserResponse


# ---------- Proyectos ----------
class CreateProjectDto(InputDto):
    name: Annotated[str, Field(min_length=3, max_length=120)]
    requirement: Annotated[str, Field(min_length=1, max_length=5000)]
    location: Annotated[str, Field(min_length=1, max_length=200)]
    reference_budget: Annotated[Decimal | None, Field(default=None, gt=0, max_digits=14, decimal_places=2)]


class TransitionDto(InputDto):
    target: ProjectState
    reason: Annotated[str | None, Field(default=None, max_length=500)]


class ProjectResponse(OutputDto):
    id: str
    name: str
    requirement: str
    location: str
    reference_budget: Decimal | None
    state: ProjectState
    created: datetime
    closing_reason: str | None

    @classmethod
    def from_domain(cls, p: Project) -> ProjectResponse:
        return cls(
            id=p.id, name=p.name, requirement=p.requirement, location=p.location,
            reference_budget=p.reference_budget, state=p.state, created=p.created,
            closing_reason=p.closing_reason,
        )  # fmt: skip


class ErrorResponse(OutputDto):
    code: str
    message: str
    track_id: str
