"""Hallazgos y veredicto. La IA propone; el código decide a partir de hallazgos con evidencia."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum

from .extraction import ProposalExtraction


class FindingCode(StrEnum):
    ALCANCE = "ALCANCE"
    COMPAT = "COMPAT"
    CAPACIDAD = "CAPACIDAD"
    CALIDAD = "CALIDAD"
    ABUSIVO = "ABUSIVO"
    ARITMETICA = "ARITMETICA"
    MANIPULACION = "MANIPULACION"
    LECTURA = "LECTURA"  # error de lectura: no descarta, pide revisión


class Origin(StrEnum):
    RULE = "rule"
    AI = "ai"
    PERSON = "person"


class Severity(StrEnum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class Verdict(StrEnum):
    VALID = "valid"
    DISCARDED = "discarded"
    PENDING_REVIEW = "pending_review"


@dataclass(frozen=True, slots=True)
class Finding:
    code: FindingCode
    severity: Severity
    discards: bool
    reason: str
    evidence: str
    origin: Origin


@dataclass(frozen=True, slots=True)
class EvaluationResult:
    proposal_id: str
    verdict: Verdict
    findings: tuple[Finding, ...] = field(default_factory=tuple)
    extraction: ProposalExtraction | None = None
