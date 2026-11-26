"""Tasas de cambio y conversión. Comparar propuestas exige una sola moneda con una tasa trazable (fuente y fecha)."""

from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from enum import StrEnum

from .amounts import to_cents
from .errors import InvalidData, RateUnavailable

PIVOT_CURRENCY = "VES"  # el BCV publica sus tasas contra el bolívar
_CODE = re.compile(r"^[A-Z]{3}$")


class RateOrigin(StrEnum):
    BCV = "bcv"
    MANUAL = "manual"


@dataclass(frozen=True, slots=True)
class ExchangeRate:
    """1 unidad de `de` equivale a `valor` unidades de `a`."""

    base: str
    quote: str
    value: Decimal
    source: str
    effective_date: date
    origin: RateOrigin

    def __post_init__(self) -> None:
        if not (_CODE.match(self.base) and _CODE.match(self.quote)) or self.base == self.quote:
            raise InvalidData("La tasa necesita dos códigos de moneda distintos de 3 letras (p. ej. USD y VES).")
        if not (self.value.is_finite() and self.value > 0):
            raise InvalidData("El valor de la tasa debe ser un número positivo.")
        if not any(c.isalnum() for c in self.source):  # también cubre espacios de ancho cero
            raise InvalidData("Toda tasa debe indicar su fuente.")


def _best(rates: Iterable[ExchangeRate], base: str, quote: str) -> tuple[Decimal, ExchangeRate] | None:
    """Factor `de -> a` con la tasa más reciente, directa o inversa."""
    candidates: list[tuple[date, Decimal, ExchangeRate]] = []
    for t in rates:
        if (t.base, t.quote) == (base, quote):
            candidates.append((t.effective_date, t.value, t))
        elif (t.base, t.quote) == (quote, base):
            candidates.append((t.effective_date, Decimal(1) / t.value, t))
    if not candidates:
        return None
    _, factor, rate = max(candidates, key=lambda c: c[0])
    return factor, rate


def convert(
    amount: Decimal, base: str, quote: str, rates: Iterable[ExchangeRate]
) -> tuple[Decimal, tuple[ExchangeRate, ...]]:
    """Convierte `monto` y devuelve también las tasas usadas (para mostrarlas en el informe)."""
    base, quote = base.strip().upper(), quote.strip().upper()
    if base == quote:
        return amount, ()
    available = tuple(rates)
    direct = _best(available, base, quote)
    if direct is not None:
        return to_cents(amount * direct[0]), (direct[1],)
    first, second = _best(available, base, PIVOT_CURRENCY), _best(available, PIVOT_CURRENCY, quote)
    if first is not None and second is not None:
        return to_cents(amount * first[0] * second[0]), (first[1], second[1])
    raise RateUnavailable(
        f"No hay tasa para convertir {base} a {quote}. Registre una manualmente con su fuente y fecha."
    )
