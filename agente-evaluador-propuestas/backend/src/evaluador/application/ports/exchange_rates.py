"""Ports for exchange rates. The domain compares proposals in one currency using a traceable rate (source + date)."""

from __future__ import annotations

from typing import Protocol

from evaluador.domain.currency import ExchangeRate


class ExchangeRateSource(Protocol):
    """An automatic source (the BCV). Must raise `TasaNoDisponible` when it cannot provide trustworthy rates."""

    def fetch(self) -> list[ExchangeRate]: ...


class ExchangeRateRepository(Protocol):
    """Every read takes `tenant_id` and the adapter MUST filter by it."""

    def save(self, tenant_id: str, rate: ExchangeRate) -> None: ...

    def list_for(self, tenant_id: str) -> list[ExchangeRate]: ...
