"""ABUSIVO: sobreprecio frente al mercado, flete desmedido, garantía solo en el exterior, prueba que luego se cobra.

El enunciado no fija cuándo un precio es desproporcionado: el umbral es configurable y **una sola fuente de
mercado no basta para descartar** (queda como advertencia). Las cláusulas se citan textualmente.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass
from decimal import Decimal

from evaluador.domain.amounts import base_of, read_amount
from evaluador.domain.errors import InvalidData
from evaluador.domain.evaluation import Finding, FindingCode, Origin, Severity
from evaluador.domain.extraction import ProposalExtraction

_OUTSIDE = r"(exterior|extranjero|fuera\s+del\s+pa[ií]s|fuera\s+de\s+venezuela|abroad|overseas)"
_ONLY = r"(solo|s[oó]lo|[uú]nicamente|exclusivamente|only)"
_WARRANTY_ABROAD = re.compile(
    rf"garant[ií]a[^.\n]{{0,60}}?{_ONLY}\s+(?:\w+\s+){{0,2}}?(?:en\s+el\s+|en\s+|con\s+validez\s+en\s+(?:el\s+)?)?{_OUTSIDE}|"
    rf"warranty[^.\n]{{0,40}}?{_ONLY}[^.\n]{{0,15}}?{_OUTSIDE}|"
    rf"{_ONLY}\s+(?:en|con\s+validez\s+en)\s+el\s+{_OUTSIDE}",
    re.IGNORECASE,
)
# Cobro posterior de una prueba. Las negaciones ('no se cobra', 'gratis', 'sin costo', 'costo cero') no cuentan.
_CHARGED_TRIAL = re.compile(
    r"(prueba|test|diagn[oó]stico)[^.\n]{0,40}?"
    r"(se\s+cobra(?:r[aá])?|ser[aá]\s+cobrad\w+|se\s+factura|tiene\s+costo|tendr[aá]\s+costo|con\s+costo)",
    re.IGNORECASE,
)
_CHARGE_NEGATION = re.compile(r"\b(no|sin|gratis|gratuit\w*|libre)\b", re.IGNORECASE)
_ZERO_CHARGE = re.compile(r"\s*(cero|alguno)\b", re.IGNORECASE)


def _charged_trial(text: str) -> re.Match[str] | None:
    for m in _CHARGED_TRIAL.finditer(text):
        negated = _CHARGE_NEGATION.search(m.group(0)) or _ZERO_CHARGE.match(text[m.end() : m.end() + 10])
        if not negated:
            return m
    return None


def _warranty_abroad(text: str) -> re.Match[str] | None:
    return _WARRANTY_ABROAD.search(text)


_CLAUSES = (
    ("Garantía válida solo en el exterior", _warranty_abroad),
    ("Prueba que luego se cobra", _charged_trial),
)


@dataclass(frozen=True, slots=True)
class MarketReference:
    unit_price: Decimal
    currency: str
    sources: int  # cuántas fuentes independientes respaldan el precio
    citation: str = ""  # referencias citadas (fuentes y precios): va en la evidencia del hallazgo


@dataclass(frozen=True, slots=True)
class AbuseParams:
    overprice_threshold: Decimal = Decimal("0.30")  # 30 % sobre el precio de mercado
    min_sources: int = 2  # fuentes distintas necesarias para descartar; nunca menos de 2 (ver MIN_SOURCES_TO_DISCARD)
    freight_threshold: Decimal = Decimal("0.15")  # 15 % de la base

    def __post_init__(self) -> None:
        if self.overprice_threshold < 0 or self.freight_threshold < 0 or self.min_sources < 1:
            raise InvalidData("Parámetros de abuso inválidos.")


MIN_SOURCES_TO_DISCARD = 2  # una sola referencia jamás descarta por precio, aunque se configure 1


def _pct(fraction: Decimal) -> str:
    return f"{(fraction * 100).normalize():f}"


def _finding(
    reason: str,
    quote: str,
    *,
    discards: bool = True,
    code: FindingCode = FindingCode.ABUSIVO,
    severity: Severity | None = None,
    limit: int = 200,
) -> Finding:
    severity = severity or (Severity.CRITICAL if discards else Severity.WARNING)
    return Finding(code, severity, discards, reason, quote[:limit], Origin.RULE)


def _not_enough_reference(n: int, found: int, needed: int, quote: str, citation: str = "") -> Finding:
    """Informativo: sin referencias suficientes no se juzga el precio (y no se trata como cero ni como abuso)."""
    evidence = f"{citation} | {quote}" if citation else quote
    return _finding(
        f"Línea {n}: sin referencia suficiente de mercado ({found} de {needed} fuentes); no se puede juzgar el precio.",
        evidence,
        discards=False,
        severity=Severity.INFO,
        limit=400,
    )


def _overprices(
    e: ProposalExtraction,
    references: Mapping[int, MarketReference],
    p: AbuseParams,
    unreferenced: Mapping[int, int],
) -> list[Finding]:
    findings: list[Finding] = []
    needed = max(p.min_sources, MIN_SOURCES_TO_DISCARD)
    for n, found in sorted(unreferenced.items()):
        if not 1 <= n <= len(e.lines):
            raise InvalidData(f"Referencia de mercado para una línea inexistente ({n}).")
        ln = e.lines[n - 1]
        findings.append(_not_enough_reference(n, found, needed, ln.evidence.text or ln.description))
    for n, ref in sorted(references.items()):
        if not 1 <= n <= len(e.lines):
            raise InvalidData(f"Referencia de mercado para una línea inexistente ({n}).")
        ln = e.lines[n - 1]
        price = read_amount(ln.unit_price)
        quote = ln.evidence.text or ln.description
        if price is None or ref.unit_price <= 0:
            continue  # el precio ilegible ya lo reporta la aritmética
        if not e.currency or e.currency.strip().upper() != ref.currency.strip().upper():
            findings.append(
                _finding(
                    f"Línea {n}: referencia de mercado en {ref.currency} y propuesta en "
                    f"{e.currency or 'moneda no indicada'}; "
                    "convierta antes de comparar.",
                    quote,
                    discards=False,
                    code=FindingCode.LECTURA,
                )
            )
            continue
        limit = ref.unit_price * (1 + p.overprice_threshold)
        if price > limit:
            excess = ((price / ref.unit_price) - 1) * 100
            reason = (
                f"Línea {n}: precio {price} supera en {excess.quantize(Decimal('0.1'))} % al de mercado "
                f"({ref.unit_price}; umbral {_pct(p.overprice_threshold)} %)."
            )
            evidence = f"{ref.citation} | {quote}" if ref.citation else quote
            if ref.sources >= needed:
                findings.append(_finding(reason, evidence, limit=400))
            else:
                why = (
                    "Una sola fuente no basta para descartar."
                    if ref.sources <= 1
                    else f"Solo {ref.sources} de {needed} fuentes: referencia insuficiente para descartar."
                )
                findings.append(_finding(f"{reason} {why}", evidence, discards=False, limit=400))
        elif ref.sources < needed:
            findings.append(_not_enough_reference(n, ref.sources, needed, quote, ref.citation))
    return findings


def _freight(e: ProposalExtraction, p: AbuseParams) -> list[Finding]:
    freight, base = read_amount(e.conditions.freight), base_of(e)
    if freight is None or base is None or base <= 0:
        return []  # sin monto o sin base no hay proporción que juzgar
    ratio = freight / base
    if ratio > p.freight_threshold:
        literal = e.conditions.freight.literal if e.conditions.freight else str(freight)
        return [
            _finding(
                f"Flete desmedido: {freight} es el {(ratio * 100).quantize(Decimal('0.1'))} % de la base "
                f"(umbral {_pct(p.freight_threshold)} %).",
                literal,
            )
        ]
    return []


def _clauses(e: ProposalExtraction) -> list[Finding]:
    texts = [t for t in (e.conditions.warranty, e.conditions.support, *e.literal_notes) if t]
    findings: list[Finding] = []
    for label, search in _CLAUSES:
        for text in texts:
            if found := search(text):
                findings.append(_finding(f"{label}.", text[max(0, found.start() - 20) : found.end() + 20]))
                break  # una cita por cláusula basta
    return findings


def validate_abuse(
    e: ProposalExtraction,
    references: Mapping[int, MarketReference] | None = None,
    p: AbuseParams | None = None,
    unreferenced: Mapping[int, int] | None = None,
) -> list[Finding]:
    """`unreferenced`: línea -> cuántas referencias comparables se hallaron (menos de las necesarias)."""
    p = p or AbuseParams()
    return [*_overprices(e, references or {}, p, unreferenced or {}), *_freight(e, p), *_clauses(e)]
