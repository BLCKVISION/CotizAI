"""Costo real de una propuesta: base + flete + instalación + recargos + impuestos que no estén ya incluidos.

Solo código y `Decimal`. Cada paso se conserva para mostrarlo en el informe, con la base de cada porcentaje.
Un costo anunciado sin cifra es **no determinado** (`monto=None`): no se trata como cero ni se esconde.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from decimal import Decimal

from .amounts import base_of, read_amount, to_cents
from .currency import ExchangeRate, convert
from .extraction import Amount, ProposalExtraction
from .rules.scope import normalize_category


@dataclass(frozen=True, slots=True)
class CostStep:
    item: str
    amount: Decimal | None  # None = no determinado
    detail: str = ""


@dataclass(frozen=True, slots=True)
class RealCost:
    currency: str | None
    steps: tuple[CostStep, ...]

    @property
    def undetermined(self) -> tuple[str, ...]:
        return tuple(p.item for p in self.steps if p.amount is None)

    @property
    def complete(self) -> bool:
        return not self.undetermined

    @property
    def partial_sum(self) -> Decimal:
        """Lo que sí se sabe. No es el costo real si `completo` es falso."""
        return sum((p.amount for p in self.steps if p.amount is not None), Decimal(0))

    @property
    def total(self) -> Decimal | None:
        """Costo real; `None` mientras falte algún monto (para ordenar se trata como desconocido)."""
        return self.partial_sum if self.complete else None


@dataclass(frozen=True, slots=True)
class ConvertedCost:
    cost: RealCost
    currency: str
    total: Decimal | None
    rates: tuple[ExchangeRate, ...]


def _non_negative(value: Decimal | None) -> Decimal | None:
    """Un flete, recargo o impuesto negativo reduciría el costo: es dato corrupto o manipulado, no un descuento."""
    return value if value is not None and value >= 0 else None


def _condition_step(item: str, amount: Amount | None, category_in_lines: str, e: ProposalExtraction) -> list[CostStep]:
    if amount is None:
        return []  # no consta: no hay nada que sumar
    if any(normalize_category(ln.category) == category_in_lines for ln in e.lines):
        return [CostStep(item, Decimal(0), "ya incluido en las líneas de la propuesta")]
    value = _non_negative(read_amount(amount))
    if value is None:
        return [CostStep(item, None, f"no determinado (el documento dice: {amount.literal[:60]!r})")]
    return [CostStep(item, value, f"según el documento: {amount.literal[:60]}")]


def _surcharge_steps(e: ProposalExtraction, base: Decimal | None) -> list[CostStep]:
    steps: list[CostStep] = []
    for r in e.conditions.surcharges:
        item = f"Recargo: {r.item[:60]}"
        if r.amount is not None and (value := _non_negative(read_amount(r.amount))) is not None:
            steps.append(CostStep(item, value, f"según el documento: {r.amount.literal[:60]}"))
        elif (
            r.percentage is not None
            and (pct := _non_negative(read_amount(r.percentage))) is not None
            and base is not None
        ):
            steps.append(CostStep(item, to_cents(base * pct / 100), f"{pct} % sobre la base {base}"))
        else:
            steps.append(CostStep(item, None, "no determinado: sin monto ni porcentaje legible y no negativo"))
    return steps


def _declared_taxes(e: ProposalExtraction) -> list[Decimal | None]:
    return [_non_negative(read_amount(i)) for i in e.totals.taxes]


def _tax_steps(e: ProposalExtraction, included: bool) -> list[CostStep]:
    if not e.totals.taxes:
        return []
    if included:
        # El total declarado ya coincide con la base (más extras): los precios llevan el impuesto incluido.
        return [CostStep("Impuestos", Decimal(0), "ya incluidos en el total declarado")]
    steps: list[CostStep] = []
    for i, (tax, value) in enumerate(zip(e.totals.taxes, _declared_taxes(e), strict=True), start=1):
        steps.append(
            CostStep(f"Impuesto {i}", value, f"según el documento: {tax.literal[:60]}")
            if value is not None
            else CostStep(f"Impuesto {i}", None, "no determinado: monto ilegible o negativo")
        )
    return steps


def _normalize_currency(currency: str | None) -> str | None:
    return (currency.strip().upper() or None) if currency else None


def compute_real_cost(e: ProposalExtraction) -> RealCost:
    base = base_of(e)
    origin = "subtotal declarado" if read_amount(e.totals.subtotal) is not None else "suma de las líneas"
    steps = [
        CostStep(
            "Monto base",
            base,
            origin if base is not None else "no determinado: no hay líneas o hay montos ilegibles",
        ),
        *_condition_step("Flete o traslado", e.conditions.freight, "freight", e),
        *_condition_step("Instalación", e.conditions.installation, "installation", e),
        *_surcharge_steps(e, base),
    ]
    extras = sum((p.amount for p in steps[1:] if p.amount is not None), Decimal(0))
    declared = read_amount(e.totals.total)
    included = base is not None and declared is not None and declared in (base, base + extras)
    steps += _tax_steps(e, included)
    if base is not None and declared is not None:
        # El total declarado debe poder explicarse con lo que se sumó. Si no, no se elige en silencio la cifra
        # más barata: queda «no determinado» y la propuesta va a revisión.
        itemized = sum((i for i in _declared_taxes(e) if i is not None), Decimal(0))
        plausible = {base, base + extras, base + itemized, base + extras + itemized}
        if declared not in plausible:
            steps.append(
                CostStep(
                    "Diferencia sin explicar frente al total declarado",
                    None,
                    f"el documento declara {declared} y lo desglosado no lo explica",
                )
            )
    return RealCost(currency=_normalize_currency(e.currency), steps=tuple(steps))


def convert_cost(cost: RealCost, target_currency: str, rates: Iterable[ExchangeRate]) -> ConvertedCost:
    """Lanza `TasaNoDisponible` si hace falta convertir y no hay tasa: nunca se inventa una."""
    total = cost.total
    if total is None or cost.currency is None:
        # Sin moneda declarada no se puede convertir; sin total completo no hay nada fiable que convertir.
        return ConvertedCost(cost, target_currency, None, ())
    converted, used = convert(total, cost.currency, target_currency, rates)
    return ConvertedCost(cost, target_currency, converted, used)
