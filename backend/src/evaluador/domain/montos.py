"""Lectura estricta de montos con Decimal. Un monto ilegible es `None` («no determinado»), nunca cero."""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from .extraccion import ExtraccionPropuesta, Monto

CENTAVOS = Decimal("0.01")
_MAX_EXPONENTE = 30


def leer_monto(monto: Monto | None) -> Decimal | None:
    """Interpreta `Monto.valor` (punto decimal). `None` si falta, está vacío, no es numérico o es absurdo."""
    if monto is None:
        return None
    try:
        valor = Decimal(monto.valor.strip())
    except (InvalidOperation, ValueError):
        return None
    return valor if valor.is_finite() and abs(valor.adjusted()) <= _MAX_EXPONENTE else None


def a_centavos(valor: Decimal) -> Decimal:
    return valor.quantize(CENTAVOS, rounding=ROUND_HALF_UP)


def is_descriptive(linea) -> bool:
    """No price at all: the line says what is included, its cost is in another one."""
    return linea.precio_unitario is None and linea.total_linea is None


def suma_de_lineas(e: ExtraccionPropuesta) -> Decimal | None:
    """Suma de `total_linea`. `None` si alguna línea es ilegible: una suma parcial no es la base."""
    if not e.lineas:
        return None  # sin líneas no hay base: «cero» haría ganar a una extracción vacía
    priced = [linea for linea in e.lineas if not is_descriptive(linea)]
    if not priced:
        return None
    suma = Decimal(0)
    for linea in priced:
        total = leer_monto(linea.total_linea)
        if total is None:
            return None
        suma += total
    return suma


def base_de(e: ExtraccionPropuesta) -> Decimal | None:
    """Subtotal declarado si es legible; si no, la suma de las líneas."""
    declarado = leer_monto(e.totales.subtotal)
    return declarado if declarado is not None else suma_de_lineas(e)
