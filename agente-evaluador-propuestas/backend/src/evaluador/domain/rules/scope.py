"""Alcance verificable con lista fija: 11 equipos completos. Lo cualitativo lo juzga el modelo con evidencia."""

from __future__ import annotations

import unicodedata
from decimal import Decimal, InvalidOperation

from evaluador.domain.evaluation import Finding, FindingCode, Origin, Severity
from evaluador.domain.extraction import ProposalExtraction

REQUIRED_DEVICES = 11
REQUIRED_CATEGORIES = ("gabinete", "monitor", "teclado", "raton", "protector")
_SYNONYMS = {"mouse": "raton", "cpu": "gabinete", "torre": "gabinete", "case": "gabinete", "pantalla": "monitor"}


def normalize_category(text: str) -> str:
    """Minúsculas, sin acentos ni plural simple: 'Ratón', 'ratones' y 'mouse' -> 'raton'."""
    t = "".join(c for c in unicodedata.normalize("NFKD", text.strip().lower()) if not unicodedata.combining(c))
    for suffix in ("es", "s"):
        if (
            t.endswith(suffix)
            and t not in REQUIRED_CATEGORIES
            and t[: -len(suffix)]
            in {
                *REQUIRED_CATEGORIES,
                *_SYNONYMS,
            }
        ):
            t = t[: -len(suffix)]
            break
    return _SYNONYMS.get(t, t)


def _quantity(value: str) -> Decimal | None:
    try:
        d = Decimal(value)
    except (InvalidOperation, ValueError):
        return None
    return d if d.is_finite() and d >= 0 and d.adjusted() <= 30 else None


def validate_fixed_scope(e: ProposalExtraction, devices: int = REQUIRED_DEVICES) -> list[Finding]:
    by_category: dict[str, Decimal] = {}
    with_unreadable_quantity: set[str] = set()
    for ln in e.lines:
        category = normalize_category(ln.category)
        quantity = _quantity(ln.quantity.value if ln.quantity else "")
        if quantity is None:
            with_unreadable_quantity.add(category)
            continue
        by_category[category] = by_category.get(category, Decimal(0)) + quantity
    missing = [c for c in REQUIRED_CATEGORIES if by_category.get(c, Decimal(0)) < devices]
    # Una cantidad ilegible no prueba que falte nada: va a revisión humana, no descarta.
    doubtful = [c for c in missing if c in with_unreadable_quantity]
    firm = [c for c in missing if c not in with_unreadable_quantity]
    findings: list[Finding] = []
    if firm:
        findings.append(
            Finding(
                FindingCode.ALCANCE,
                Severity.CRITICAL,
                True,
                f"No cubre {devices} unidades de: {', '.join(firm)}.",
                "lista fija de requisitos",
                Origin.RULE,
            )
        )
    if doubtful:
        findings.append(
            Finding(
                FindingCode.LECTURA,
                Severity.WARNING,
                False,
                f"Cantidad ilegible; no se puede verificar {devices} unidades de: {', '.join(doubtful)}.",
                "lista fija de requisitos",
                Origin.RULE,
            )
        )
    return findings
