"""Checks the extraction against the document before any rule reads it.

A model sometimes completes a quote with figures it computed itself. A subtotal that is not printed anywhere cannot
discard a supplier, so only totals found in the text are kept.
"""

from __future__ import annotations

import re
from decimal import Decimal

from .contrato import readings
from .document_text import plain
from .extraccion import ExtraccionPropuesta, Linea, Monto
from .montos import leer_monto

_FIGURE = re.compile(r"\d(?:[\d.,]*\d)?")
# A surcharge for paying in bolívares does not apply to a quote in dollars.
_ONLY_IF_PAID_IN_BS = re.compile(r"\b(?:bcv|cambiari[ao]|bolivares|pagos? en bs)\b")


def _figures(text: str) -> set[Decimal]:
    return {value for figure in _FIGURE.findall(text) for value in readings(figure)}


def _printed(amount: Monto | None, figures: set[Decimal]) -> Monto | None:
    value = leer_monto(amount)
    if value is None:
        return amount  # missing or not a number ("to be agreed"): the rules already treat it as undetermined
    return amount if value in figures else None


def _computed(value: Decimal, how: str) -> Monto:
    return Monto(literal=how, valor=str(value))


def _line(line: Linea, figures: set[Decimal]) -> Linea:
    quantity, price, total = leer_monto(line.cantidad), leer_monto(line.precio_unitario), line.total_linea
    # A spreadsheet formula without a stored result: the model computed it, so the code does it again.
    if total is not None and total.literal.lstrip().startswith("=") and leer_monto(total) not in figures:
        total = None
    if quantity == 1 and price is None and total is not None and leer_monto(total) is not None:
        # One unit: its unit price is the line total.
        line = line.model_copy(update={"precio_unitario": total})
        price = leer_monto(total)
    if total is None and quantity is not None and price is not None:
        total = _computed(quantity * price, f"calculado: {quantity} x {price}")
    elif total is None and line.cantidad is None and price is not None:
        total = _computed(price, "cargo único")
    return line.model_copy(update={"total_linea": total})


def normalise(e: ExtraccionPropuesta, document: str) -> ExtraccionPropuesta:
    figures = _figures(document)
    totals, conditions = e.totales, e.condiciones
    if figures:  # without any figure in the text there is nothing to compare with
        totals = totals.model_copy(update={
            "subtotal": _printed(totals.subtotal, figures),
            "total": _printed(totals.total, figures),
            "impuestos": [t for t in totals.impuestos if _printed(t, figures) is not None],
        })  # fmt: skip
        conditions = conditions.model_copy(update={
            "flete": _printed(conditions.flete, figures),
            "instalacion": _printed(conditions.instalacion, figures),
        })  # fmt: skip
    if (e.moneda or "").strip().upper() in ("USD", "$", "US$"):
        applicable = [r for r in conditions.recargos if not _ONLY_IF_PAID_IN_BS.search(plain(r.concepto))]
        conditions = conditions.model_copy(update={"recargos": applicable})
    lines = [_line(line, figures) for line in e.lineas]
    return e.model_copy(update={"lineas": lines, "totales": totals, "condiciones": conditions})
