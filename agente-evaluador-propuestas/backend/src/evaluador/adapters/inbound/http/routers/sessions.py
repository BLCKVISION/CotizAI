from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status

from evaluador.adapters.inbound.http.dtos import SessionResponse, StartSessionDto, UserResponse
from evaluador.adapters.inbound.http.guards import current_session, header_token, limit_login
from evaluador.application.use_cases.authentication import AuthenticatedSession

router = APIRouter(tags=["sessions"])


@router.post("/sessions", status_code=status.HTTP_201_CREATED, dependencies=[Depends(limit_login)])
def start_session(dto: StartSessionDto, request: Request) -> SessionResponse:
    """Inicia sesión con correo y contraseña. El tenant se deduce del usuario. Devuelve un token opaco de corta vida."""
    r = request.app.state.container.start_session.execute(dto.email, dto.password.get_secret_value())
    return SessionResponse(access_token=r.token, expires=r.expires, user=UserResponse.from_domain(r.user))


@router.delete("/sessions/current", status_code=status.HTTP_204_NO_CONTENT)
def close_session(request: Request, token: Annotated[str, Depends(header_token)]) -> Response:
    request.app.state.container.close_session.execute(token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/users/current")
def current_user(session: Annotated[AuthenticatedSession, Depends(current_session)]) -> UserResponse:
    return UserResponse.from_domain(session.user)
