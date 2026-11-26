"""CALIDAD: equipos usados, reacondicionados o reciclados, y obsolescencia declarada.

Descartar mal a un proveedor es lo más costoso en una licitación, así que hay dos niveles de evidencia:

- **Inequívoco** («reacondicionado», «refurbished», «segunda mano»…): descarta, con la frase citada.
- **Ambiguo** («usado», «renovado», «reciclado»…): en el campo `condicion` descarta; en texto libre puede referirse a
  una licencia renovada o a un empaque reciclado, así que solo pide revisión humana.

«Inferior a lo cobrado» exige comparar contra la ficha del fabricante: es un juicio cualitativo del modelo (con cita),
no de esta regla determinista.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from evaluador.domain import specs as spec
from evaluador.domain.evaluation import Finding, FindingCode, Origin, Severity
from evaluador.domain.extraction import ProposalExtraction

_UNAMBIGUOUS = re.compile(
    r"\b(re-?acondicionad\w*|re-?condicionad\w*|refurbish\w*|refurb|remanufacturad\w*|open\s*box|segunda\s*mano|"
    r"second[\s-]?hand|pre[\s-]?owned|seminuev\w*)\b"
)
_AMBIGUOUS = re.compile(r"\b(usad\w*|used|renovad\w*|reciclad\w*|reutilizad\w*)\b")
# «no/sin/nunca/ni/jamás» antes de la mención y en la misma oración (sin cruzar . ; : ni comas).
_NEGATION = re.compile(r"\b(no|sin|nunca|ni|jamas)\b[^.;:,]*$")
_PLAUSIBLE_YEAR = range(1980, 2101)


@dataclass(frozen=True, slots=True)
class QualityParams:
    min_year: int = 2018  # por debajo se considera obsoleto; configurable y registrado en el informe
    obsolete_ram_types: frozenset[str] = frozenset({"ddr2", "ddr3"})


def _finding(reason: str, quote: str, *, discards: bool = True) -> Finding:
    code = FindingCode.CALIDAD if discards else FindingCode.LECTURA
    severity = Severity.CRITICAL if discards else Severity.WARNING
    return Finding(code, severity, discards, reason, quote[:200], Origin.RULE)


def _mention(pattern: re.Pattern[str], text: str) -> str | None:
    """Primera mención no negada ('no usado', 'nunca ha sido reacondicionado' no cuentan). Texto sin acentos."""
    flat = spec.strip_accents(text).lower()
    for m in pattern.finditer(flat):
        if not _NEGATION.search(flat[max(0, m.start() - 40) : m.start()]):
            return m.group(0)
    return None


def _condition_of(texts: tuple[str, ...], *, is_condition_field: bool = False) -> tuple[str, bool] | None:
    """`(mención, descarta)`: lo inequívoco siempre descarta; lo ambiguo solo si es el campo `condicion`."""
    for text in texts:
        if mention := _mention(_UNAMBIGUOUS, text):
            return mention, True
    for text in texts:
        if mention := _mention(_AMBIGUOUS, text):
            return mention, is_condition_field
    return None


def validate_quality(e: ProposalExtraction, p: QualityParams | None = None) -> list[Finding]:
    p = p or QualityParams()
    findings: list[Finding] = []
    for n, ln in enumerate(e.lines, start=1):
        quote = ln.evidence.text or ln.description
        specs = ln.specs
        found = _condition_of((specs.get(spec.CONDITION, ""),), is_condition_field=True) or (
            _condition_of((ln.description, ln.model or ""))
        )
        if found:
            mention, discards = found
            reason = f"Línea {n}: equipo no nuevo ('{spec.trim(mention)}')."
            if not discards:
                reason = f"Línea {n}: menciona '{spec.trim(mention)}'; confirme que no indica un equipo no nuevo."
            findings.append(_finding(reason, quote, discards=discards))
        raw_year = specs.get(spec.RELEASE_YEAR)
        if raw_year is not None:
            year = spec.read_year(raw_year)
            if year is None or year not in _PLAUSIBLE_YEAR:
                findings.append(
                    _finding(f"Línea {n}: año de lanzamiento ilegible o ambiguo.", ln.description, discards=False)
                )
            elif year < p.min_year:
                findings.append(
                    _finding(f"Línea {n}: obsoleto, lanzado en {year} (mínimo {p.min_year}).", ln.description)
                )
        ram = specs.get(spec.RAM_TYPE)
        if ram is not None and spec.normalize_ram_type(ram) in p.obsolete_ram_types:
            findings.append(_finding(f"Línea {n}: memoria obsoleta ({spec.trim(ram)}).", ln.description))
    for note in e.literal_notes:
        if found := _condition_of((note,)):
            mention, discards = found
            text = (
                "indica equipo no nuevo"
                if discards
                else "menciona un término ambiguo; confirme que no indica equipo no nuevo"
            )
            findings.append(_finding(f"Nota de la propuesta {text} ('{spec.trim(mention)}').", note, discards=discards))
    return findings
