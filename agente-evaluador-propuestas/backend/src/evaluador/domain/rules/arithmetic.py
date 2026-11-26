"""Aritmética solo con Decimal y coincidencia exacta. Nunca la hace el modelo."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation

from evaluador.domain.evaluation import Finding, FindingCode, Origin, Severity
from evaluador.domain.extraction import Amount, ProposalExtraction


def _d(m: Amount | None) -> Decimal | None:
    if m is None:
        return None
    try:
        d = Decimal(m.value)
    except (InvalidOperation, ValueError):
        return None
    # NaN/Infinity y exponentes absurdos no son montos: se tratan como ilegibles (revisión humana).
    return d if d.is_finite() and abs(d.adjusted()) <= 30 else None


def _finding(reason: str, evidence: str) -> Finding:
    return Finding(FindingCode.ARITMETICA, Severity.CRITICAL, True, reason, evidence, Origin.RULE)


def validate_arithmetic(e: ProposalExtraction) -> list[Finding]:
    findings: list[Finding] = []
    total_sum = Decimal(0)
    valid_sum = True
    for i, ln in enumerate(e.lines, start=1):
        qty, price, total = _d(ln.quantity), _d(ln.unit_price), _d(ln.line_total)
        if None in (qty, price, total):
            findings.append(
                Finding(
                    FindingCode.LECTURA,
                    Severity.WARNING,
                    False,
                    f"Línea {i}: monto ilegible o no numérico.",
                    ln.evidence.text,
                    Origin.RULE,
                )
            )
            valid_sum = False
            continue
        if qty * price != total:
            findings.append(
                _finding(f"Línea {i}: {qty} × {price} = {qty * price}, el documento dice {total}.", ln.evidence.text)
            )
        total_sum += total

    subtotal = e.totals.subtotal
    sub = _d(subtotal) if subtotal else None
    if subtotal and sub is not None and valid_sum and sub != total_sum:
        findings.append(
            _finding(f"La suma de líneas ({total_sum}) no coincide con el subtotal ({sub}).", subtotal.literal)
        )

    total_m = e.totals.total
    total = _d(total_m) if total_m else None
    if total_m and total is not None and sub is not None:
        taxes = [_d(x) for x in e.totals.taxes]
        if all(i is not None for i in taxes) and sub + sum((i for i in taxes if i is not None), Decimal(0)) != total:
            findings.append(_finding("Subtotal + impuestos no coincide con el total.", total_m.literal))
    return findings
