"""Validación del contrato de extracción (sección 3.1): lo que el modelo devuelve debe ser auditable.

Reglas: cada monto es `null` (no consta) o trae `literal` (tal cual el documento) y `valor` (numérico y coherente con
el literal); cada línea cita su evidencia. Un incumplimiento es un error de lectura —se relee y, si persiste,
revisión humana—, nunca un motivo de descarte del proveedor.
"""

from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation

from .extraccion import ExtraccionPropuesta, Monto

_RUIDO = re.compile(r"[^\d.,\-+]")
# Words suppliers write instead of a figure when something costs nothing extra.
_ZERO_WORDS = re.compile(
    r"\b(inclu[ií]d[oa]s?|gratis|gratuit[oa]|sin (costo|cargo)|bonificad[oa]|cortes[ií]a|"
    r"free( of charge| shipping| delivery)?|no (extra )?charge|at no cost)\b",
    re.IGNORECASE,
)


def _decimal(texto: str) -> Decimal | None:
    try:
        d = Decimal(texto)
    except (InvalidOperation, ValueError):
        return None
    return d if d.is_finite() and d.adjusted() <= 30 else None


def _interpretaciones(literal: str) -> set[Decimal]:
    """Lecturas posibles del literal. Con un solo separador es ambiguo (`1.100`) y se aceptan ambas."""
    t = _RUIDO.sub("", literal)
    if not any(c.isdigit() for c in t):
        return set()
    punto, coma = t.rfind("."), t.rfind(",")
    candidatas: list[str] = []
    if punto >= 0 and coma >= 0:  # el último separador es el decimal
        dec, mil = (".", ",") if punto > coma else (",", ".")
        candidatas.append(t.replace(mil, "").replace(dec, "."))
    elif punto >= 0 or coma >= 0:
        sep = "." if punto >= 0 else ","
        head, _, tail = t.rpartition(sep)
        if t.count(sep) > 1 and len(tail) == 2:  # `15,540,00`: same sign for thousands and cents
            candidatas.append(f"{head.replace(sep, '')}.{tail}")
        candidatas.append(t.replace(sep, "") if t.count(sep) > 1 else t.replace(sep, "."))  # decimal (1 sola vez)
        candidatas.append(t.replace(sep, ""))  # miles
    else:
        candidatas.append(t)
    return {d for c in candidatas if (d := _decimal(c)) is not None}


def readings(literal: str) -> set[Decimal]:
    """Every legitimate way of reading a printed figure."""
    return _interpretaciones(literal)


def literal_coincide(literal: str, valor: str) -> bool:
    """¿`valor` (punto decimal) es una lectura legítima de `literal`?"""
    v = _decimal(valor.strip())
    return v is not None and v in _interpretaciones(literal)


def _is_spreadsheet_formula(literal: str) -> bool:
    return literal.lstrip().startswith("=")


def says_it_is_free(literal: str) -> bool:
    """Only without any figure and without a condition: "gratis desde $500" is not free."""
    conditional = re.search(r"\b(si|desde|a partir|s[oó]lo|if|over|above)\b", literal, re.IGNORECASE)
    return not any(c.isdigit() for c in literal) and bool(_ZERO_WORDS.search(literal)) and not conditional


def _is_zero_in_words(monto: Monto) -> bool:
    """«Incluido» read as 0 is faithful. Only zero is accepted: any other figure would be invented."""
    has_digits = any(c.isdigit() for c in monto.literal)
    return not has_digits and bool(_ZERO_WORDS.search(monto.literal)) and _decimal(monto.valor.strip()) == 0


def _problema_de_monto(monto: Monto | None) -> str | None:
    if monto is None:
        return None
    if not monto.literal.strip():
        return (
            "trae valor sin literal (valor inventado); debe ser null si no consta"
            if monto.valor.strip()
            else ("está vacío; debe ser null si no consta")
        )
    if _decimal(monto.valor.strip()) is None:
        return f"valor no numérico ({monto.valor!r}) para el literal {monto.literal!r}"
    if _is_spreadsheet_formula(monto.literal):
        return None  # the reader hands over the formula and its computed value; arithmetic rules still check it
    if _is_zero_in_words(monto):
        return None
    if not literal_coincide(monto.literal, monto.valor):
        return f"valor {monto.valor!r} no corresponde al literal {monto.literal!r}"
    return None


def validar_contrato(e: ExtraccionPropuesta) -> list[str]:
    problemas: list[str] = []
    for i, ln in enumerate(e.lineas, start=1):
        if not ln.evidencia.texto.strip():
            problemas.append(f"Línea {i}: sin evidencia (texto citado).")
        for campo in ("cantidad", "precio_unitario", "total_linea"):
            if p := _problema_de_monto(getattr(ln, campo)):
                problemas.append(f"Línea {i}, {campo}: {p}.")
    totales = e.totales
    for campo, monto in (("subtotal", totales.subtotal), ("total", totales.total)):
        if p := _problema_de_monto(monto):
            problemas.append(f"Totales, {campo}: {p}.")
    for j, imp in enumerate(totales.impuestos, start=1):
        if p := _problema_de_monto(imp):
            problemas.append(f"Totales, impuesto {j}: {p}.")
    return problemas
