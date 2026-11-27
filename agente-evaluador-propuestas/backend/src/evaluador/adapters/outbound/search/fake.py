"""Fuente de precios determinista para pruebas: respuestas por categoría normalizada."""

from __future__ import annotations

import threading
import time

from evaluador.domain.market import PriceQuery, PriceReference


class FakeMarketPrices:
    def __init__(
        self, by_category: dict[str, list[PriceReference]], *, fail_times: int = 0, delay: float = 0.0
    ) -> None:
        self._by_category = by_category
        self._fail_times = fail_times
        self._delay = delay
        self._lock = threading.Lock()
        self.calls = 0
        self.queries: list[PriceQuery] = []

    def lookup(self, query: PriceQuery) -> list[PriceReference]:
        with self._lock:
            self.calls += 1
            self.queries.append(query)
            failing = self._fail_times > 0
            if failing:
                self._fail_times -= 1
        if self._delay:
            time.sleep(self._delay)
        if failing:
            raise RuntimeError("fuente caída")
        return list(self._by_category.get(query.category.strip().lower(), []))
