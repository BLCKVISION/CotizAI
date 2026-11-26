"""Exchange-rate use cases: register a manual rate (with source and date) and resolve the rates in force.

Order of trust: the automatic source (BCV) first; if it is down or its page changed, the latest manual rate that is
still in force. If neither exists we raise `TasaNoDisponible`: a rate is never invented.
"""

from __future__ import annotations

import logging
from datetime import date
from decimal import Decimal

from evaluador.application.ports.exchange_rates import ExchangeRateRepository, ExchangeRateSource
from evaluador.application.ports.output import Audit, Clock
from evaluador.domain.currency import ExchangeRate, RateOrigin
from evaluador.domain.errors import InvalidData, RateUnavailable
from evaluador.domain.identity import Permission, User

_log = logging.getLogger("evaluador.rates")


class RegisterManualRate:
    def __init__(self, repository: ExchangeRateRepository, clock: Clock, audit: Audit) -> None:
        self._repository = repository
        self._clock = clock
        self._audit = audit

    def execute(
        self, actor: User, *, base: str, quote: str, value: Decimal, source: str, effective_date: date
    ) -> ExchangeRate:
        actor.require(Permission.REGISTER_RATE)
        if effective_date > self._clock.now().date():
            raise InvalidData("La fecha de la tasa no puede estar en el futuro.")
        # `TasaDeCambio` valida códigos, valor positivo y fuente no vacía.
        rate = ExchangeRate(
            base.strip().upper(), quote.strip().upper(), value, source.strip(), effective_date, RateOrigin.MANUAL
        )
        self._repository.save(actor.tenant_id, rate)  # siempre el tenant del actor, nunca el del cliente
        self._audit.register(
            tenant_id=actor.tenant_id, actor=actor.id, action="rate_registered", detail=f"{rate.base}/{rate.quote}"
        )
        return rate


class ResolveRates:
    def __init__(
        self,
        source: ExchangeRateSource,
        repository: ExchangeRateRepository,
        clock: Clock,
        max_age_days: int = 3,
    ) -> None:
        if max_age_days < 0:
            raise InvalidData("La vigencia máxima no puede ser negativa.")
        self._source = source
        self._repository = repository
        self._clock = clock
        self._max_age_days = max_age_days

    def execute(self, tenant_id: str) -> list[ExchangeRate]:
        try:
            for rate in self._source.fetch():
                self._repository.save(tenant_id, rate)
        except RateUnavailable:
            _log.warning("automatic_rate_unavailable")  # se usa la última vigente registrada
        today = self._clock.now().date()
        in_force = [
            r
            for r in self._repository.list_for(tenant_id)
            if 0 <= (today - r.effective_date).days <= self._max_age_days
        ]
        if not in_force:
            raise RateUnavailable("No hay una tasa vigente. Registre una manualmente con su fuente y fecha.")
        return in_force
