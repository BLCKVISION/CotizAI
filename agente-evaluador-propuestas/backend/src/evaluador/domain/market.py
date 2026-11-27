"""Referencias de precios de mercado: consulta, referencia puntual y resumen por mediana entre fuentes distintas."""

from __future__ import annotations

import statistics
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from .amounts import to_cents
from .rules.abusive import MarketReference

_MAX_CITED = 5


@dataclass(frozen=True, slots=True)
class PriceQuery:
    category: str
    brand: str | None
    model: str | None
    description: str


@dataclass(frozen=True, slots=True)
class PriceReference:
    price: Decimal  # precio unitario
    currency: str
    source: str  # nombre o dominio de la fuente: se cita en la evidencia
    fetched_at: datetime


def _median(values: list[Decimal]) -> Decimal:
    return statistics.median(values)


def reference_from_prices(refs: list[PriceReference], proposal_currency: str | None) -> MarketReference | None:
    """Resume referencias comparables: misma moneda (la de la propuesta si hay; si no, la más frecuente), una voz
    por fuente (mediana de sus precios) y mediana entre fuentes. `sources` cuenta fuentes distintas."""
    valid = [r for r in refs if r.price.is_finite() and r.price > 0 and r.source.strip()]
    if not valid:
        return None
    by_currency: dict[str, list[PriceReference]] = defaultdict(list)
    for r in valid:
        by_currency[r.currency.strip().upper()].append(r)
    wanted = (proposal_currency or "").strip().upper()
    currency = wanted if wanted in by_currency else max(by_currency, key=lambda c: (len(by_currency[c]), c))
    per_source: dict[str, list[Decimal]] = defaultdict(list)
    for r in by_currency[currency]:
        per_source[r.source.strip()].append(r.price)
    voices = {source: _median(prices) for source, prices in per_source.items()}
    unit = to_cents(_median(list(voices.values())))
    cited = ", ".join(f"{s} {to_cents(v)}" for s, v in sorted(voices.items())[:_MAX_CITED])
    more = f" (+{len(voices) - _MAX_CITED} más)" if len(voices) > _MAX_CITED else ""
    citation = f"Mercado {currency}: mediana {unit} de {len(voices)} fuente(s): {cited}{more}"
    return MarketReference(unit, currency, len(voices), citation)
