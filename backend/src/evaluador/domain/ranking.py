"""Orden final: válidas por puntaje con equivalencia técnica (desempate por costo), luego pendientes y descartadas.

Equivalencia sin ciclos: se ordena por puntaje; se forma un grupo con las que están a ≤ δ puntos de la **primera
del grupo**; se ordena el grupo por menor costo real; se repite con el resto. El orden es determinista: el empate
final se rompe por identificador, y el ranking nunca repite ni omite una propuesta.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from decimal import Decimal

from .errores import DatoInvalido
from .evaluacion import Veredicto


def _decimal_finito(valor: object, *, minimo: int, maximo: int | None = None) -> bool:
    return isinstance(valor, Decimal) and valor.is_finite() and valor >= minimo and (maximo is None or valor <= maximo)


@dataclass(frozen=True, slots=True)
class Candidata:
    propuesta_id: str
    veredicto: Veredicto
    puntaje: Decimal | None = None  # obligatorio si es válida
    costo_real: Decimal | None = None  # None = desconocido: pierde los desempates por costo

    def __post_init__(self) -> None:
        if self.puntaje is not None and not _decimal_finito(self.puntaje, minimo=0, maximo=100):
            raise DatoInvalido("El puntaje debe ser un Decimal finito entre 0 y 100.")
        if self.costo_real is not None and not _decimal_finito(self.costo_real, minimo=0):
            raise DatoInvalido("El costo real debe ser un Decimal finito y no negativo.")


@dataclass(frozen=True, slots=True)
class ParametrosDeRanking:
    delta: Decimal = Decimal(3)  # puntos de diferencia dentro de los cuales hay equivalencia técnica

    def __post_init__(self) -> None:
        if not _decimal_finito(self.delta, minimo=0):
            raise DatoInvalido("δ debe ser un Decimal finito y no negativo.")


def _orden_por_costo(c: Candidata) -> tuple[bool, Decimal, str]:
    return (c.costo_real is None, c.costo_real if c.costo_real is not None else Decimal(0), c.propuesta_id)


def _ordenar_validas(validas: list[Candidata], delta: Decimal) -> list[str]:
    por_puntaje = sorted(validas, key=lambda c: (-(c.puntaje or Decimal(0)), c.propuesta_id))
    orden: list[str] = []
    i = 0
    while i < len(por_puntaje):
        lider = por_puntaje[i].puntaje or Decimal(0)
        j = i
        while j < len(por_puntaje) and lider - (por_puntaje[j].puntaje or Decimal(0)) <= delta:
            j += 1
        orden += [c.propuesta_id for c in sorted(por_puntaje[i:j], key=_orden_por_costo)]
        i = j
    return orden


def ordenar_ranking(candidatas: Iterable[Candidata], p: ParametrosDeRanking | None = None) -> tuple[str, ...]:
    p = p or ParametrosDeRanking()
    todas = list(candidatas)
    ids = [c.propuesta_id for c in todas]
    if len(set(ids)) != len(ids):
        raise DatoInvalido("El ranking no admite propuestas repetidas.")
    validas = [c for c in todas if c.veredicto is Veredicto.VALIDA]
    if any(c.puntaje is None for c in validas):
        raise DatoInvalido("Toda propuesta válida necesita puntaje para ordenarse.")
    pendientes = sorted(c.propuesta_id for c in todas if c.veredicto is Veredicto.PENDIENTE_DE_REVISION)
    descartadas = sorted(c.propuesta_id for c in todas if c.veredicto is Veredicto.DESCARTADA)
    return (*_ordenar_validas(validas, p.delta), *pendientes, *descartadas)
