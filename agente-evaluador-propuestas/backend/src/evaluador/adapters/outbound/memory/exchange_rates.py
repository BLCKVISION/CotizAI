"""In-memory exchange-rate repository (tests and development). Isolates by tenant like the SQL adapter will."""

from __future__ import annotations

from evaluador.domain.currency import ExchangeRate


class InMemoryExchangeRates:
    def __init__(self) -> None:
        self._by_tenant: dict[str, list[ExchangeRate]] = {}

    def save(self, tenant_id: str, rate: ExchangeRate) -> None:
        rates = self._by_tenant.setdefault(tenant_id, [])
        # La misma tasa (par, fecha, origen) se reemplaza: consultar el BCV varias veces el mismo día no duplica.
        rates[:] = [
            r
            for r in rates
            if (r.base, r.quote, r.effective_date, r.origin)
            != (rate.base, rate.quote, rate.effective_date, rate.origin)
        ]
        rates.append(rate)

    def list_for(self, tenant_id: str) -> list[ExchangeRate]:
        return list(self._by_tenant.get(tenant_id, ()))
