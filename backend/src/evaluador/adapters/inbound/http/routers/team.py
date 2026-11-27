"""The organisation's team, its roles and what each role may do."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Path, Request, status
from pydantic import Field, SecretStr

from evaluador.adapters.inbound.http.dtos import DtoEntrada
from evaluador.adapters.inbound.http.guards import sesion_actual
from evaluador.application.use_cases.autenticacion import SesionAutenticada
from evaluador.domain.identidad import PERMISOS_POR_ROL, Permiso, Rol, Usuario

router = APIRouter(prefix="/team", tags=["team"])
Session = Annotated[SesionAutenticada, Depends(sesion_actual)]  # the use case checks the permission
MemberId = Annotated[str, Path(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9-]+$")]


class NewMemberDto(DtoEntrada):
    display_name: Annotated[str, Field(min_length=3, max_length=80, pattern=r"^[^<>{}\r\n]+$")]
    email: Annotated[str, Field(min_length=3, max_length=254)]
    password: Annotated[SecretStr, Field(min_length=1, max_length=128)]
    role: Rol


class MemberChangeDto(DtoEntrada):
    role: Rol | None = None
    active: bool | None = None


def _member(member: Usuario, actor: Usuario) -> dict[str, Any]:
    return {"id": member.id, "email": member.correo, "display_name": member.display_name, "role": member.rol,
            "active": member.activo, "is_you": member.id == actor.id}  # fmt: skip


@router.get("")
def team(request: Request, session: Session) -> dict[str, Any]:
    actor = session.usuario
    members = request.app.state.contenedor.team.members(actor)
    return {
        "can_manage": actor.tiene(Permiso.MANAGE_TEAM),
        "members": [_member(m, actor) for m in members],
        # The matrix the server enforces, so the screen can never describe something else.
        "roles": [{"role": r, "permissions": sorted(PERMISOS_POR_ROL[r])} for r in Rol],
    }


@router.post("", status_code=status.HTTP_201_CREATED)
def add_member(dto: NewMemberDto, request: Request, session: Session) -> dict[str, Any]:
    member = request.app.state.contenedor.team.add(
        session.usuario, display_name=dto.display_name, email=dto.email,
        password=dto.password.get_secret_value(), role=dto.role,
    )  # fmt: skip
    return _member(member, session.usuario)


@router.post("/{member_id}")
def change_member(member_id: MemberId, dto: MemberChangeDto, request: Request, session: Session) -> dict[str, Any]:
    member = request.app.state.contenedor.team.update(session.usuario, member_id, role=dto.role, active=dto.active)
    return _member(member, session.usuario)
