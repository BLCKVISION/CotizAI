"""Casos de uso de proyectos. Autorización y aislamiento por tenant se aplican aquí, no en HTTP."""

from __future__ import annotations

from decimal import Decimal

from evaluador.application.ports.salida import Auditoria, GeneradorDeIds, ProyectoRepositorio, Reloj
from evaluador.domain.errores import NoEncontrado
from evaluador.domain.identidad import Permiso, Usuario
from evaluador.domain.proyecto import PERMISO_POR_DESTINO, EstadoProyecto, Proyecto


class CrearProyecto:
    def __init__(self, proyectos: ProyectoRepositorio, ids: GeneradorDeIds, reloj: Reloj, auditoria: Auditoria) -> None:
        self._proyectos = proyectos
        self._ids = ids
        self._reloj = reloj
        self._auditoria = auditoria

    def ejecutar(
        self,
        actor: Usuario,
        *,
        nombre: str,
        requerimiento: str,
        ubicacion: str,
        presupuesto_referencial: Decimal | None,
        moneda: str = "USD",
    ) -> Proyecto:
        actor.exigir(Permiso.CREAR_PROYECTO)
        proyecto = Proyecto.crear(
            id=self._ids.nuevo(),
            tenant_id=actor.tenant_id,  # siempre el del actor, nunca el del cliente
            nombre=nombre,
            requerimiento=requerimiento,
            ubicacion=ubicacion,
            presupuesto_referencial=presupuesto_referencial,
            moneda=moneda,
            creado_por=actor.id,
            ahora=self._reloj.ahora(),
        )
        self._proyectos.guardar(proyecto)
        self._auditoria.registrar(
            tenant_id=actor.tenant_id, actor=actor.id, accion="proyecto_creado", detalle=proyecto.id
        )
        return proyecto


class ListarProyectos:
    def __init__(self, proyectos: ProyectoRepositorio) -> None:
        self._proyectos = proyectos

    def ejecutar(self, actor: Usuario) -> list[Proyecto]:
        actor.exigir(Permiso.VER_ESTADO)
        return self._proyectos.listar(actor.tenant_id)


class ObtenerProyecto:
    def __init__(self, proyectos: ProyectoRepositorio) -> None:
        self._proyectos = proyectos

    def ejecutar(self, actor: Usuario, proyecto_id: str) -> Proyecto:
        actor.exigir(Permiso.VER_ESTADO)
        proyecto = self._proyectos.por_id(actor.tenant_id, proyecto_id)
        if proyecto is None:  # también cubre "existe pero es de otro tenant": mismo 404
            raise NoEncontrado("Proyecto no encontrado.")
        return proyecto


class TransicionarProyecto:
    def __init__(self, proyectos: ProyectoRepositorio, auditoria: Auditoria) -> None:
        self._proyectos = proyectos
        self._auditoria = auditoria

    def ejecutar(self, actor: Usuario, proyecto_id: str, destino: EstadoProyecto, motivo: str | None) -> Proyecto:
        actor.exigir(PERMISO_POR_DESTINO[destino])
        proyecto = self._proyectos.por_id(actor.tenant_id, proyecto_id)
        if proyecto is None:
            raise NoEncontrado("Proyecto no encontrado.")
        nuevo = proyecto.transicionar(destino, motivo)
        self._proyectos.guardar(nuevo)
        self._auditoria.registrar(
            tenant_id=actor.tenant_id,
            actor=actor.id,
            accion="proyecto_transicion",
            detalle=f"{proyecto.id}:{proyecto.estado}->{destino}",
        )
        return nuevo
