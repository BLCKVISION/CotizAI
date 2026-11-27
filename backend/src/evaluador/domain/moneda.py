"""Tasas de cambio y conversión. Comparar propuestas exige una sola moneda con una tasa trazable (fuente y fecha)."""

from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from enum import StrEnum

from .errores import DatoInvalido, TasaNoDisponible
from .montos import a_centavos

MONEDA_PIVOTE = "VES"  # el BCV publica sus tasas contra el bolívar
_CODIGO = re.compile(r"^[A-Z]{3}$")
# How quotations (and the models that transcribe them) usually write a currency.
_ALIASES = {
    "BS": "VES", "BSS": "VES", "BSD": "VES", "VEF": "VES", "BOLIVAR": "VES", "BOLIVARES": "VES",
    "$": "USD", "US$": "USD", "USD$": "USD", "DOLAR": "USD", "DOLARES": "USD", "€": "EUR", "EURO": "EUR",
    "EUROS": "EUR",
}  # fmt: skip


def normalize_currency(value: str | None) -> str | None:
    """ISO code for a currency as written in a document, or None when it is not stated."""
    if not value:
        return None
    key = value.strip().upper().replace(".", "").replace(" ", "").replace("Í", "I").replace("Ó", "O")
    return _ALIASES.get(key, key) or None


class OrigenDeTasa(StrEnum):
    BCV = "bcv"
    MANUAL = "manual"


@dataclass(frozen=True, slots=True)
class TasaDeCambio:
    """1 unidad de `de` equivale a `valor` unidades de `a`."""

    de: str
    a: str
    valor: Decimal
    fuente: str
    fecha: date
    origen: OrigenDeTasa

    def __post_init__(self) -> None:
        if not (_CODIGO.match(self.de) and _CODIGO.match(self.a)) or self.de == self.a:
            raise DatoInvalido("La tasa necesita dos códigos de moneda distintos de 3 letras (p. ej. USD y VES).")
        if not (self.valor.is_finite() and self.valor > 0):
            raise DatoInvalido("El valor de la tasa debe ser un número positivo.")
        if not any(c.isalnum() for c in self.fuente):  # también cubre espacios de ancho cero
            raise DatoInvalido("Toda tasa debe indicar su fuente.")


def _mejor(tasas: Iterable[TasaDeCambio], de: str, a: str) -> tuple[Decimal, TasaDeCambio] | None:
    """Factor `de -> a` con la tasa más reciente, directa o inversa."""
    candidatas: list[tuple[date, Decimal, TasaDeCambio]] = []
    for t in tasas:
        if (t.de, t.a) == (de, a):
            candidatas.append((t.fecha, t.valor, t))
        elif (t.de, t.a) == (a, de):
            candidatas.append((t.fecha, Decimal(1) / t.valor, t))
    if not candidatas:
        return None
    _, factor, tasa = max(candidatas, key=lambda c: c[0])
    return factor, tasa


def convertir(
    monto: Decimal, de: str, a: str, tasas: Iterable[TasaDeCambio]
) -> tuple[Decimal, tuple[TasaDeCambio, ...]]:
    """Convierte `monto` y devuelve también las tasas usadas (para mostrarlas en el informe)."""
    de, a = de.strip().upper(), a.strip().upper()
    if de == a:
        return monto, ()
    disponibles = tuple(tasas)
    directa = _mejor(disponibles, de, a)
    if directa is not None:
        return a_centavos(monto * directa[0]), (directa[1],)
    primera, segunda = _mejor(disponibles, de, MONEDA_PIVOTE), _mejor(disponibles, MONEDA_PIVOTE, a)
    if primera is not None and segunda is not None:
        return a_centavos(monto * primera[0] * segunda[0]), (primera[1], segunda[1])
    raise TasaNoDisponible(f"No hay tasa para convertir {de} a {a}. Registre una manualmente con su fuente y fecha.")
