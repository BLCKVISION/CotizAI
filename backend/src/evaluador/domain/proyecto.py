"""Proyecto y su máquina de estados (patrón State como tabla de transiciones)."""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import datetime
from decimal import Decimal
from enum import StrEnum

from .errores import DatoInvalido, TransicionInvalida
from .identidad import Permiso


class EstadoProyecto(StrEnum):
    EN_RECEPCION = "en_recepcion"
    EN_EVALUACION = "en_evaluacion"
    EN_REVISION_DEL_COMITE = "en_revision_del_comite"
    ADJUDICADO = "adjudicado"
    CERRADO = "cerrado"


E = EstadoProyecto

# destino permitido -> origenes válidos
_TRANSICIONES: dict[EstadoProyecto, frozenset[EstadoProyecto]] = {
    E.EN_EVALUACION: frozenset({E.EN_RECEPCION}),
    E.EN_RECEPCION: frozenset({E.EN_EVALUACION}),  # la evaluación falló
    E.EN_REVISION_DEL_COMITE: frozenset({E.EN_EVALUACION}),
    E.ADJUDICADO: frozenset({E.EN_REVISION_DEL_COMITE}),
    E.CERRADO: frozenset({E.EN_RECEPCION, E.EN_REVISION_DEL_COMITE, E.ADJUDICADO}),
}

PERMISO_POR_DESTINO: dict[EstadoProyecto, Permiso] = {
    E.EN_EVALUACION: Permiso.INICIAR_EVALUACION,
    E.EN_RECEPCION: Permiso.INICIAR_EVALUACION,
    E.EN_REVISION_DEL_COMITE: Permiso.INICIAR_EVALUACION,
    E.ADJUDICADO: Permiso.ADJUDICAR_O_CERRAR,
    E.CERRADO: Permiso.ADJUDICAR_O_CERRAR,
}


@dataclass(frozen=True, slots=True)
class Proyecto:
    id: str
    tenant_id: str
    nombre: str
    requerimiento: str
    ubicacion: str
    presupuesto_referencial: Decimal | None
    estado: EstadoProyecto
    creado_por: str
    creado: datetime
    motivo_de_cierre: str | None = None
    moneda: str = "USD"  # moneda del presupuesto referencial: USD | VES

    @staticmethod
    def crear(
        *,
        id: str,
        tenant_id: str,
        nombre: str,
        requerimiento: str,
        ubicacion: str,
        presupuesto_referencial: Decimal | None,
        creado_por: str,
        ahora: datetime,
        moneda: str = "USD",
    ) -> Proyecto:
        if not nombre.strip():
            raise DatoInvalido("El nombre del proyecto es obligatorio.")
        if presupuesto_referencial is not None and presupuesto_referencial <= 0:
            raise DatoInvalido("El presupuesto referencial debe ser positivo.")
        return Proyecto(
            id=id,
            tenant_id=tenant_id,
            nombre=nombre.strip(),
            requerimiento=requerimiento.strip(),
            ubicacion=ubicacion.strip(),
            presupuesto_referencial=presupuesto_referencial,
            estado=E.EN_RECEPCION,
            creado_por=creado_por,
            creado=ahora,
            moneda=moneda,
        )

    @property
    def was_awarded(self) -> bool:
        """Closing without awarding requires a reason, so a closed project without one had been awarded."""
        return self.estado is E.ADJUDICADO or (self.estado is E.CERRADO and not self.motivo_de_cierre)

    def reopened_for_reception(self) -> Proyecto:
        """Only for a project left with nothing evaluated; people cannot request this transition."""
        if self.estado is not E.EN_REVISION_DEL_COMITE:
            raise TransicionInvalida(f"No se puede reabrir un proyecto en '{self.estado}'.")
        return replace(self, estado=E.EN_RECEPCION)

    def transicionar(self, destino: EstadoProyecto, motivo: str | None = None) -> Proyecto:
        if self.estado not in _TRANSICIONES.get(destino, frozenset()):
            raise TransicionInvalida(f"No se puede pasar de '{self.estado}' a '{destino}'.")
        if destino is E.CERRADO and self.estado is not E.ADJUDICADO and not (motivo or "").strip():
            raise DatoInvalido("Cerrar sin adjudicar exige un motivo.")
        return replace(
            self,
            estado=destino,
            motivo_de_cierre=(motivo or "").strip() or None if destino is E.CERRADO else self.motivo_de_cierre,
        )
