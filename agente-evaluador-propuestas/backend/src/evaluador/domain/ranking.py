"""Orden final: válidas por puntaje con equivalencia técnica (desempate por costo), luego pendientes y descartadas.

Equivalencia sin ciclos: se ordena por puntaje; se forma un grupo con las que están a ≤ δ puntos de la **primera
del grupo**; se ordena el grupo por menor costo real; se repite con el resto. El orden es determinista: el empate
final se rompe por identificador, y el ranking nunca repite ni omite una propuesta.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from decimal import Decimal

from .errors import InvalidData
from .evaluation import Verdict


def _decimal_finite(value: object, *, minimum: int, maximum: int | None = None) -> bool:
    return (
        isinstance(value, Decimal) and value.is_finite() and value >= minimum and (maximum is None or value <= maximum)
    )


@dataclass(frozen=True, slots=True)
class Candidate:
    proposal_id: str
    verdict: Verdict
    score: Decimal | None = None  # obligatorio si es válida
    real_cost: Decimal | None = None  # None = desconocido: pierde los desempates por costo

    def __post_init__(self) -> None:
        if self.score is not None and not _decimal_finite(self.score, minimum=0, maximum=100):
            raise InvalidData("El puntaje debe ser un Decimal finito entre 0 y 100.")
        if self.real_cost is not None and not _decimal_finite(self.real_cost, minimum=0):
            raise InvalidData("El costo real debe ser un Decimal finito y no negativo.")


@dataclass(frozen=True, slots=True)
class RankingParams:
    delta: Decimal = Decimal(3)  # puntos de diferencia dentro de los cuales hay equivalencia técnica

    def __post_init__(self) -> None:
        if not _decimal_finite(self.delta, minimum=0):
            raise InvalidData("δ debe ser un Decimal finito y no negativo.")


def _order_by_cost(c: Candidate) -> tuple[bool, Decimal, str]:
    return (c.real_cost is None, c.real_cost if c.real_cost is not None else Decimal(0), c.proposal_id)


def _sort_valid(valid: list[Candidate], delta: Decimal) -> list[str]:
    by_score = sorted(valid, key=lambda c: (-(c.score or Decimal(0)), c.proposal_id))
    order: list[str] = []
    i = 0
    while i < len(by_score):
        leader = by_score[i].score or Decimal(0)
        j = i
        while j < len(by_score) and leader - (by_score[j].score or Decimal(0)) <= delta:
            j += 1
        order += [c.proposal_id for c in sorted(by_score[i:j], key=_order_by_cost)]
        i = j
    return order


def sort_ranking(candidates: Iterable[Candidate], p: RankingParams | None = None) -> tuple[str, ...]:
    p = p or RankingParams()
    all_items = list(candidates)
    ids = [c.proposal_id for c in all_items]
    if len(set(ids)) != len(ids):
        raise InvalidData("El ranking no admite propuestas repetidas.")
    valid = [c for c in all_items if c.verdict is Verdict.VALID]
    if any(c.score is None for c in valid):
        raise InvalidData("Toda propuesta válida necesita puntaje para ordenarse.")
    pending = sorted(c.proposal_id for c in all_items if c.verdict is Verdict.PENDING_REVIEW)
    discarded = sorted(c.proposal_id for c in all_items if c.verdict is Verdict.DISCARDED)
    return (*_sort_valid(valid, p.delta), *pending, *discarded)
