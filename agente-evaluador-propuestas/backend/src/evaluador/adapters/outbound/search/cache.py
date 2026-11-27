"""Caché en memoria (TTL, acotada, thread-safe) para cualquier fuente de precios.

Los componentes repetidos se consultan UNA vez, también en paralelo (un candado por clave evita consultas dobles).
Los errores no se cachean. La clave es el hash de la consulta normalizada (sin mayúsculas, espacios ni acentos).
"""

from __future__ import annotations

import hashlib
import re
import threading
import time
import unicodedata
from collections.abc import Callable

from evaluador.application.ports.market import MarketPriceSource
from evaluador.domain.market import PriceQuery, PriceReference


def _norm(text: str | None) -> str:
    folded = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode("ascii")
    return re.sub(r"\s+", " ", folded).strip().lower()


def query_key(q: PriceQuery) -> str:
    raw = "|".join(_norm(x) for x in (q.category, q.brand, q.model, q.description))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


class CachedMarketPrices:
    def __init__(
        self,
        inner: MarketPriceSource,
        *,
        ttl_seconds: float = 3600.0,
        max_entries: int = 1024,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._inner, self._ttl, self._max, self._clock = inner, ttl_seconds, max_entries, clock
        self._entries: dict[str, tuple[float, list[PriceReference]]] = {}
        self._key_locks: dict[str, threading.Lock] = {}
        self._lock = threading.Lock()

    def size(self) -> int:
        with self._lock:
            return len(self._entries)

    def _fresh(self, key: str) -> list[PriceReference] | None:
        with self._lock:
            hit = self._entries.get(key)
            if hit and hit[0] > self._clock():
                return list(hit[1])
            return None

    def _store(self, key: str, refs: list[PriceReference]) -> None:
        with self._lock:
            now = self._clock()
            for k in [k for k, (exp, _) in self._entries.items() if exp <= now]:
                del self._entries[k]
            while len(self._entries) >= self._max:
                del self._entries[min(self._entries, key=lambda k: self._entries[k][0])]  # la más próxima a vencer
            self._entries[key] = (now + self._ttl, list(refs))

    def lookup(self, query: PriceQuery) -> list[PriceReference]:
        key = query_key(query)
        if (hit := self._fresh(key)) is not None:
            return hit
        with self._lock:
            key_lock = self._key_locks.setdefault(key, threading.Lock())
        try:
            with key_lock:  # una sola consulta en vuelo por componente
                if (hit := self._fresh(key)) is not None:
                    return hit
                refs = self._inner.lookup(query)
                self._store(key, refs)
        finally:  # también si la fuente falla: no se acumulan candados
            with self._lock:
                self._key_locks.pop(key, None)
        return list(refs)
