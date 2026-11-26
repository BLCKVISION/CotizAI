from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Request, status

from evaluador.adapters.inbound.http.dtos import ID_PATRON, CrearProyectoDto, ProyectoRespuesta, TransicionDto
from evaluador.adapters.inbound.http.guards import exigir
from evaluador.application.use_cases.autenticacion import SesionAutenticada
from evaluador.domain.identidad import Permiso

router = APIRouter(prefix="/proyectos", tags=["proyectos"])
ProyectoId = Annotated[str, Path(pattern=ID_PATRON)]


@router.post("", status_code=status.HTTP_201_CREATED)
def crear_proyecto(
    dto: CrearProyectoDto,
    request: Request,
    sesion: Annotated[SesionAutenticada, Depends(exigir(Permiso.CREAR_PROYECTO))],
) -> ProyectoRespuesta:
    p = request.app.state.contenedor.crear_proyecto.ejecutar(sesion.usuario, **dto.model_dump())
    return ProyectoRespuesta.desde_dominio(p)


@router.get("")
def listar_proyectos(
    request: Request, sesion: Annotated[SesionAutenticada, Depends(exigir(Permiso.VER_ESTADO))]
) -> list[ProyectoRespuesta]:
    ps = request.app.state.contenedor.listar_proyectos.ejecutar(sesion.usuario)
    return [ProyectoRespuesta.desde_dominio(p) for p in ps]


@router.get("/{proyecto_id}")
def obtener_proyecto(
    proyecto_id: ProyectoId,
    request: Request,
    sesion: Annotated[SesionAutenticada, Depends(exigir(Permiso.VER_ESTADO))],
) -> ProyectoRespuesta:
    return ProyectoRespuesta.desde_dominio(
        request.app.state.contenedor.obtener_proyecto.ejecutar(sesion.usuario, proyecto_id)
    )


@router.post("/{proyecto_id}/transiciones")
def transicionar_proyecto(
    proyecto_id: ProyectoId,
    dto: TransicionDto,
    request: Request,
    sesion: Annotated[SesionAutenticada, Depends(exigir(Permiso.VER_ESTADO))],
) -> ProyectoRespuesta:
    """El permiso fino depende del destino y lo aplica el caso de uso."""
    p = request.app.state.contenedor.transicionar_proyecto.ejecutar(
        sesion.usuario, proyecto_id, dto.destino, dto.motivo
    )
    return ProyectoRespuesta.desde_dominio(p)
