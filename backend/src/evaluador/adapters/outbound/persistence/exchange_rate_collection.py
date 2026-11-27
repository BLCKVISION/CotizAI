"""Exchange rates on top of a stored collection, so manual rates survive restarts when PostgreSQL is used."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from evaluador.application.ports.salida import Reloj
from evaluador.domain.moneda import TasaDeCambio


@dataclass(frozen=True, slots=True)
class RateRecord:
    id: str
    tenant_id: str
    creado: datetime
    rate: TasaDeCambio


class _Collection(Protocol):
    def guardar(self, entidad: RateRecord) -> None: ...
    def listar(self, tenant_id: str) -> list[RateRecord]: ...


class CollectionExchangeRates:
    def __init__(self, records: _Collection, clock: Reloj) -> None:
        self._records, self._clock = records, clock

    def save(self, tenant_id: str, rate: TasaDeCambio) -> None:
        # Same pair, date and origin replace each other: asking the BCV twice a day does not duplicate.
        key = f"{rate.de}-{rate.a}-{rate.fecha.isoformat()}-{rate.origen.value}"
        self._records.guardar(RateRecord(key, tenant_id, self._clock.ahora(), rate))

    def list_for(self, tenant_id: str) -> list[TasaDeCambio]:
        # Oldest first: among rates of the same date, the one registered last is considered last.
        return [r.rate for r in sorted(self._records.listar(tenant_id), key=lambda r: r.creado)]
