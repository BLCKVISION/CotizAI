from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request, Response, status
from fastapi.concurrency import run_in_threadpool
from pydantic import Field

from evaluador.adapters.inbound.http.dtos import DtoEntrada
from evaluador.adapters.inbound.http.guards import sesion_actual
from evaluador.adapters.inbound.http.routers.proyectos import ProyectoId
from evaluador.adapters.outbound.memory.auditoria_log import cadena_integra
from evaluador.application.use_cases.autenticacion import SesionAutenticada
from evaluador.application.use_cases.gestion import Gestion
from evaluador.domain.gestion import Evento, Nota, Propuesta, Proveedor
from evaluador.domain.identidad import Permiso

router = APIRouter(tags=["gestion"])
Sesion = Annotated[SesionAutenticada, Depends(sesion_actual)]  # el permiso lo aplica cada caso de uso


class NotaDto(DtoEntrada):
    texto: Annotated[str, Field(min_length=1, max_length=2000)]


class ProveedorDto(DtoEntrada):
    nombre: Annotated[str, Field(min_length=2, max_length=120)]
    rif: Annotated[str, Field(pattern=r"^[JGVEPjgvep]-?\d{7,9}-?\d?$")]
    ubicacion: Annotated[str, Field(min_length=2, max_length=200)]
    contacto: Annotated[str, Field(min_length=3, max_length=200)]


def _g(request: Request) -> Gestion:
    gestion: Gestion = request.app.state.contenedor.gestion
    return gestion


def _propuesta(p: Propuesta) -> dict[str, Any]:
    return {"id": p.id, "archivo": p.archivo, "formato": p.formato, "tamano": p.tamano, "sha256": p.sha256,
            "creado": p.creado}  # fmt: skip


def _proveedor(p: Proveedor) -> dict[str, Any]:
    return {"id": p.id, "nombre": p.nombre, "rif": p.rif, "ubicacion": p.ubicacion, "contacto": p.contacto,
            "creado": p.creado}  # fmt: skip


def _nota(g: Gestion, n: Nota) -> dict[str, Any]:
    return {"id": n.id, "texto": n.texto, "autor": g.correo_de(n.tenant_id, n.autor), "creado": n.creado}


def _evento(g: Gestion, e: Evento) -> dict[str, Any]:
    creado: datetime = e.creado
    return {"id": e.id, "accion": e.accion, "detalle": e.detalle, "actor": g.correo_de(e.tenant_id, e.actor),
            "creado": creado, "secuencia": e.secuencia, "huella": e.huella}  # fmt: skip


@router.get("/estadisticas")
def estadisticas(request: Request, s: Sesion) -> dict[str, Any]:
    return _g(request).estadisticas(s.usuario)


@router.get("/auditoria")
def auditoria(request: Request, s: Sesion) -> dict[str, Any]:
    g = _g(request)
    eventos = g.auditoria(s.usuario)
    return {
        "integra": cadena_integra(eventos),
        "total": len(eventos),
        "eventos": [_evento(g, e) for e in eventos[:200]],
    }


@router.get("/proveedores")
def proveedores(request: Request, s: Sesion) -> list[dict[str, Any]]:
    return [_proveedor(p) for p in _g(request).proveedores(s.usuario)]


@router.post("/proveedores", status_code=status.HTTP_201_CREATED)
def registrar_proveedor(dto: ProveedorDto, request: Request, s: Sesion) -> dict[str, Any]:
    return _proveedor(_g(request).registrar_proveedor(s.usuario, **dto.model_dump()))


@router.get("/proyectos/{proyecto_id}/propuestas")
def propuestas(proyecto_id: ProyectoId, request: Request, s: Sesion) -> list[dict[str, Any]]:
    return [_propuesta(p) for p in _g(request).propuestas_de(s.usuario, proyecto_id)]


@router.post("/proyectos/{proyecto_id}/propuestas", status_code=status.HTTP_201_CREATED)
async def cargar_propuesta(
    proyecto_id: ProyectoId, request: Request, s: Sesion, archivo: Annotated[str, Query(max_length=160)]
) -> dict[str, Any]:
    """El cuerpo es el archivo en binario; el tamaño máximo lo aplica el interceptor y el dominio."""
    s.usuario.exigir(Permiso.CARGAR_DOCUMENTOS)  # antes de leer el cuerpo
    contenido = await request.body()
    return _propuesta(await run_in_threadpool(_g(request).cargar, s.usuario, proyecto_id, archivo, contenido))


@router.get("/proyectos/{proyecto_id}/propuestas/{propuesta_id}/archivo")
def descargar(proyecto_id: ProyectoId, propuesta_id: ProyectoId, request: Request, s: Sesion) -> Response:
    p, contenido = _g(request).descargar(s.usuario, proyecto_id, propuesta_id)
    return Response(contenido, media_type="application/octet-stream",
                    headers={"Content-Disposition": f'attachment; filename="{p.archivo}"'})  # fmt: skip


@router.get("/proyectos/{proyecto_id}/propuestas/{propuesta_id}/markdown")
def proposal_markdown(proyecto_id: ProyectoId, propuesta_id: ProyectoId, request: Request, s: Sesion) -> dict[str, Any]:
    use_case = request.app.state.contenedor.proposal_markdown
    filename, document = use_case.execute(s.usuario, proyecto_id, propuesta_id)
    return {"filename": filename, "markdown": document.markdown, "engine": document.engine,
            "notices": list(document.notices)}  # fmt: skip


@router.delete("/proyectos/{proyecto_id}/propuestas/{propuesta_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar(proyecto_id: ProyectoId, propuesta_id: ProyectoId, request: Request, s: Sesion) -> Response:
    request.app.state.contenedor.delete_proposal.execute(s.usuario, proyecto_id, propuesta_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/proyectos/{proyecto_id}/notas")
def notas(proyecto_id: ProyectoId, request: Request, s: Sesion) -> list[dict[str, Any]]:
    g = _g(request)
    return [_nota(g, n) for n in g.notas_de(s.usuario, proyecto_id)]


@router.post("/proyectos/{proyecto_id}/notas", status_code=status.HTTP_201_CREATED)
def anotar(proyecto_id: ProyectoId, dto: NotaDto, request: Request, s: Sesion) -> dict[str, Any]:
    g = _g(request)
    return _nota(g, g.anotar(s.usuario, proyecto_id, dto.texto))


@router.get("/proyectos/{proyecto_id}/historial")
def historial(proyecto_id: ProyectoId, request: Request, s: Sesion) -> list[dict[str, Any]]:
    g = _g(request)
    return [_evento(g, e) for e in g.historial(s.usuario, proyecto_id)]
