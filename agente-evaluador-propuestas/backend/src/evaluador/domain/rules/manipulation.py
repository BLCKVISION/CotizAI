"""Detección determinista de instrucciones dirigidas a la IA dentro de la propuesta (datos no confiables)."""

from __future__ import annotations

import re

from evaluador.domain.evaluation import Finding, FindingCode, Origin, Severity

_PATTERNS = [
    r"\bignor[ae]\s+(todas?\s+)?(las\s+)?(instrucciones|reglas)\b",
    r"\bignore\s+(all\s+)?(previous|prior|above)\s+instructions\b",
    r"\b(eres|act[uú]a\s+como|you\s+are\s+now)\s+(un|una|el|la|a|an|the)\b",
    r"\b(califica|punt[uú]a|rate|score)\b\s+.{0,40}(m[aá]xim|perfect|10/10|\b100\b)",
    r"\bno\s+(descartes|descalifiques)\s+esta\s+propuesta\b",
    r"\b(system|sistema)\s*prompt\b",
    r"\b(aprueba|apruebe|aprobar)\s+(esta|la)\s+propuesta\b",
]
_REGEX = [re.compile(p, re.IGNORECASE) for p in _PATTERNS]


def detect_manipulation(text: str, model_suspicions: list[str]) -> list[Finding]:
    rule = [m.group(0) for r in _REGEX for m in r.finditer(text)]
    model = [s.strip() for s in model_suspicions if s.strip()]
    quotes = {c: Origin.RULE for c in rule} | {c: Origin.AI for c in model if c not in rule}
    return [
        Finding(FindingCode.MANIPULACION, Severity.CRITICAL, True,
                 "Instrucción dirigida a la IA dentro de la propuesta.", quote[:200], origin)
        for quote, origin in quotes.items()
    ]  # fmt: skip
