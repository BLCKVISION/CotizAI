from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status

from evaluador.adapters.inbound.http.dtos import IniciarSesionDto, SesionRespuesta, UsuarioRespuesta
from evaluador.adapters.inbound.http.guards import limitar_login, sesion_actual, token_de_cabecera
from evaluador.application.use_cases.autenticacion import SesionAutenticada

router = APIRouter(tags=["sesiones"])


@router.post("/sesiones", status_code=status.HTTP_201_CREATED, dependencies=[Depends(limitar_login)])
def iniciar_sesion(dto: IniciarSesionDto, request: Request) -> SesionRespuesta:
    """Inicia sesión con correo y contraseña. El tenant se deduce del usuario. Devuelve un JWT firmado de corta vida."""
    r = request.app.state.contenedor.iniciar_sesion.ejecutar(dto.correo, dto.contrasena.get_secret_value())
    return SesionRespuesta(token_acceso=r.token, expira=r.expira, usuario=UsuarioRespuesta.desde_dominio(r.usuario))


@router.delete("/sesiones/actual", status_code=status.HTTP_204_NO_CONTENT)
def cerrar_sesion(request: Request, token: Annotated[str, Depends(token_de_cabecera)]) -> Response:
    request.app.state.contenedor.cerrar_sesion.ejecutar(token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/usuarios/actual")
def usuario_actual(sesion: Annotated[SesionAutenticada, Depends(sesion_actual)]) -> UsuarioRespuesta:
    return UsuarioRespuesta.desde_dominio(sesion.usuario)
