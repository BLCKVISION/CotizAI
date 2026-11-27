from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status
from pydantic import Field, SecretStr

from evaluador.adapters.inbound.http.dtos import DtoEntrada, IniciarSesionDto, SesionRespuesta, UsuarioRespuesta
from evaluador.adapters.inbound.http.guards import limitar_login, sesion_actual, token_de_cabecera
from evaluador.application.use_cases.autenticacion import SesionAutenticada
from evaluador.observabilidad import contexto

router = APIRouter(tags=["sesiones"])


@router.post("/sesiones", status_code=status.HTTP_201_CREATED, dependencies=[Depends(limitar_login)])
def iniciar_sesion(dto: IniciarSesionDto, request: Request) -> SesionRespuesta:
    """Inicia sesión con correo y contraseña. El tenant se deduce del usuario. Devuelve un JWT firmado de corta vida."""
    r = request.app.state.contenedor.iniciar_sesion.ejecutar(dto.correo, dto.contrasena.get_secret_value())
    return SesionRespuesta(token_acceso=r.token, expira=r.expira, usuario=UsuarioRespuesta.desde_dominio(r.usuario))


class RegistrationDto(DtoEntrada):
    display_name: Annotated[str, Field(min_length=3, max_length=80, pattern=r"^[^<>{}\r\n]+$")]
    email: Annotated[str, Field(max_length=254, pattern=r"^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$")]
    password: Annotated[SecretStr, Field(min_length=1, max_length=128)]


@router.post("/registrations", status_code=status.HTTP_204_NO_CONTENT)
def register(dto: RegistrationDto, request: Request) -> Response:
    """Same empty answer for a new and an already registered address."""
    request.app.state.registration_limiter.verificar(contexto.obtener().ip)
    request.app.state.contenedor.register_account.execute(
        dto.display_name, dto.email, dto.password.get_secret_value()
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/sesiones/actual", status_code=status.HTTP_204_NO_CONTENT)
def cerrar_sesion(request: Request, token: Annotated[str, Depends(token_de_cabecera)]) -> Response:
    request.app.state.contenedor.cerrar_sesion.ejecutar(token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/usuarios/actual")
def usuario_actual(sesion: Annotated[SesionAutenticada, Depends(sesion_actual)]) -> UsuarioRespuesta:
    return UsuarioRespuesta.desde_dominio(sesion.usuario)
