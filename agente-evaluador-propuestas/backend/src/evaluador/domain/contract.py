"""Validación del contrato de extracción (sección 3.1): lo que el modelo devuelve debe ser auditable.

Reglas: cada monto es `null` (no consta) o trae `literal` (tal cual el documento) y `valor` (numérico y coherente con
el literal); cada línea cita su evidencia. Un incumplimiento es un error de lectura —se relee y, si persiste,
revisión humana—, nunca un motivo de descarte del proveedor.
"""

from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation

from .extraction import Amount, ProposalExtraction

_NOISE = re.compile(r"[^\d.,\-+]")


def _decimal(text: str) -> Decimal | None:
    try:
        d = Decimal(text)
    except (InvalidOperation, ValueError):
        return None
    return d if d.is_finite() and d.adjusted() <= 30 else None


def _interpretations(literal: str) -> set[Decimal]:
    """Lecturas posibles del literal. Con un solo separador es ambiguo (`1.100`) y se aceptan ambas."""
    t = _NOISE.sub("", literal)
    if not any(c.isdigit() for c in t):
        return set()
    point, comma = t.rfind("."), t.rfind(",")
    candidates: list[str] = []
    if point >= 0 and comma >= 0:  # el último separador es el decimal
        dec, thousand = (".", ",") if point > comma else (",", ".")
        candidates.append(t.replace(thousand, "").replace(dec, "."))
    elif point >= 0 or comma >= 0:
        sep = "." if point >= 0 else ","
        candidates.append(t.replace(sep, "") if t.count(sep) > 1 else t.replace(sep, "."))  # decimal (1 sola vez)
        candidates.append(t.replace(sep, ""))  # miles
    else:
        candidates.append(t)
    return {d for c in candidates if (d := _decimal(c)) is not None}


def literal_matches(literal: str, value: str) -> bool:
    """¿`valor` (punto decimal) es una lectura legítima de `literal`?"""
    v = _decimal(value.strip())
    return v is not None and v in _interpretations(literal)


def _amount_problem(amount: Amount | None) -> str | None:
    if amount is None:
        return None
    if not amount.literal.strip():
        return (
            "trae valor sin literal (valor inventado); debe ser null si no consta"
            if amount.value.strip()
            else ("está vacío; debe ser null si no consta")
        )
    if _decimal(amount.value.strip()) is None:
        return f"valor no numérico ({amount.value!r}) para el literal {amount.literal!r}"
    if not literal_matches(amount.literal, amount.value):
        return f"valor {amount.value!r} no corresponde al literal {amount.literal!r}"
    return None


def validate_contract(e: ProposalExtraction) -> list[str]:
    problems: list[str] = []
    for i, ln in enumerate(e.lines, start=1):
        if not ln.evidence.text.strip():
            problems.append(f"Línea {i}: sin evidencia (texto citado).")
        for field in ("quantity", "unit_price", "line_total"):
            if p := _amount_problem(getattr(ln, field)):
                problems.append(f"Línea {i}, {field}: {p}.")
    totals = e.totals
    for field, amount in (("subtotal", totals.subtotal), ("total", totals.total)):
        if p := _amount_problem(amount):
            problems.append(f"Totales, {field}: {p}.")
    for j, tax in enumerate(totals.taxes, start=1):
        if p := _amount_problem(tax):
            problems.append(f"Totales, impuesto {j}: {p}.")
    return problems
