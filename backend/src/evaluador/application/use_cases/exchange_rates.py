"""Exchange-rate use cases: register a manual rate (with source and date) and resolve the rates in force.

Order of trust: the automatic source (BCV) first; if it is down or its page changed, the latest manual rate that is
still in force. If neither exists we raise `TasaNoDisponible`: a rate is never invented.
"""

from __future__ import annotations

import logging
from datetime import date
from decimal import Decimal

from evaluador.application.ports.exchange_rates import ExchangeRateRepository, ExchangeRateSource
from evaluador.application.ports.salida import Auditoria, Reloj
from evaluador.domain.errores import DatoInvalido, TasaNoDisponible
from evaluador.domain.identidad import Permiso, Usuario
from evaluador.domain.moneda import OrigenDeTasa, TasaDeCambio

_log = logging.getLogger("evaluador.tasas")
# The BCV publishes in the evening with the value date of the next business day (up to 4 days over a long weekend).
_BCV_MAX_DAYS_AHEAD = 4


class RegisterManualRate:
    def __init__(self, repository: ExchangeRateRepository, clock: Reloj, audit: Auditoria) -> None:
        self._repository = repository
        self._clock = clock
        self._audit = audit

    def execute(
        self, actor: Usuario, *, base: str, quote: str, value: Decimal, source: str, effective_date: date
    ) -> TasaDeCambio:
        actor.exigir(Permiso.REGISTRAR_TASA)
        if effective_date > self._clock.ahora().date():
            raise DatoInvalido("La fecha de la tasa no puede estar en el futuro.")
        # `TasaDeCambio` valida códigos, valor positivo y fuente no vacía.
        rate = TasaDeCambio(
            base.strip().upper(), quote.strip().upper(), value, source.strip(), effective_date, OrigenDeTasa.MANUAL
        )
        self._repository.save(actor.tenant_id, rate)  # siempre el tenant del actor, nunca el del cliente
        self._audit.registrar(
            tenant_id=actor.tenant_id, actor=actor.id, accion="tasa_registrada", detalle=f"{rate.de}/{rate.a}"
        )
        return rate


class ResolveRates:
    def __init__(
        self,
        source: ExchangeRateSource,
        repository: ExchangeRateRepository,
        clock: Reloj,
        max_age_days: int = 3,
    ) -> None:
        if max_age_days < 0:
            raise DatoInvalido("La vigencia máxima no puede ser negativa.")
        self._source = source
        self._repository = repository
        self._clock = clock
        self._max_age_days = max_age_days

    def execute(self, tenant_id: str) -> list[TasaDeCambio]:
        try:
            for rate in self._source.fetch():
                self._repository.save(tenant_id, rate)
        except TasaNoDisponible:
            _log.warning("tasa_automatica_no_disponible")  # se usa la última vigente registrada
        today = self._clock.ahora().date()
        in_force = [r for r in self._repository.list_for(tenant_id) if self._is_in_force(r, today)]
        if not in_force:
            raise TasaNoDisponible("No hay una tasa vigente. Registre una manualmente con su fuente y fecha.")
        return in_force

    def _is_in_force(self, rate: TasaDeCambio, today: date) -> bool:
        earliest = -_BCV_MAX_DAYS_AHEAD if rate.origen is OrigenDeTasa.BCV else 0
        return earliest <= (today - rate.fecha).days <= self._max_age_days
