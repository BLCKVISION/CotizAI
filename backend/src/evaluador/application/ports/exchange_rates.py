"""Ports for exchange rates. The domain compares proposals in one currency using a traceable rate (source + date)."""

from __future__ import annotations

from typing import Protocol

from evaluador.domain.moneda import TasaDeCambio


class ExchangeRateSource(Protocol):
    """An automatic source (the BCV). Must raise `TasaNoDisponible` when it cannot provide trustworthy rates."""

    def fetch(self) -> list[TasaDeCambio]: ...


class ExchangeRateRepository(Protocol):
    """Every read takes `tenant_id` and the adapter MUST filter by it."""

    def save(self, tenant_id: str, rate: TasaDeCambio) -> None: ...

    def list_for(self, tenant_id: str) -> list[TasaDeCambio]: ...
