"""In-memory exchange-rate repository (tests and development). Isolates by tenant like the SQL adapter will."""

from __future__ import annotations

from evaluador.domain.moneda import TasaDeCambio


class InMemoryExchangeRates:
    def __init__(self) -> None:
        self._by_tenant: dict[str, list[TasaDeCambio]] = {}

    def save(self, tenant_id: str, rate: TasaDeCambio) -> None:
        rates = self._by_tenant.setdefault(tenant_id, [])
        # La misma tasa (par, fecha, origen) se reemplaza: consultar el BCV varias veces el mismo día no duplica.
        rates[:] = [r for r in rates if (r.de, r.a, r.fecha, r.origen) != (rate.de, rate.a, rate.fecha, rate.origen)]
        rates.append(rate)

    def list_for(self, tenant_id: str) -> list[TasaDeCambio]:
        return list(self._by_tenant.get(tenant_id, ()))
