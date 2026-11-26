"""Lectura estricta de montos con Decimal. Un monto ilegible es `None` («no determinado»), nunca cero."""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from .extraction import Amount, ProposalExtraction

CENTS = Decimal("0.01")
_MAX_EXPONENT = 30


def read_amount(amount: Amount | None) -> Decimal | None:
    """Interpreta `Monto.valor` (punto decimal). `None` si falta, está vacío, no es numérico o es absurdo."""
    if amount is None:
        return None
    try:
        value = Decimal(amount.value.strip())
    except (InvalidOperation, ValueError):
        return None
    return value if value.is_finite() and abs(value.adjusted()) <= _MAX_EXPONENT else None


def to_cents(value: Decimal) -> Decimal:
    return value.quantize(CENTS, rounding=ROUND_HALF_UP)


def sum_of_lines(e: ProposalExtraction) -> Decimal | None:
    """Suma de `total_linea`. `None` si alguna línea es ilegible: una suma parcial no es la base."""
    if not e.lines:
        return None  # sin líneas no hay base: «cero» haría ganar a una extracción vacía
    total_sum = Decimal(0)
    for line in e.lines:
        total = read_amount(line.line_total)
        if total is None:
            return None
        total_sum += total
    return total_sum


def base_of(e: ProposalExtraction) -> Decimal | None:
    """Subtotal declarado si es legible; si no, la suma de las líneas."""
    declared = read_amount(e.totals.subtotal)
    return declared if declared is not None else sum_of_lines(e)
