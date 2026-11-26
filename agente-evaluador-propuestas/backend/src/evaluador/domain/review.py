"""Revisión humana: notas, correcciones y decisión. Nunca sobrescriben el resultado de la IA; se guardan aparte."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum


class ReviewKind(StrEnum):
    NOTE = "note"
    CORRECTION = "correction"  # la persona corrige un dato o veredicto; el original queda intacto
    DECISION = "decision"  # recomendación de adjudicar o descartar una propuesta


@dataclass(frozen=True, slots=True)
class Review:
    id: str
    tenant_id: str
    job_id: str
    proposal_id: str | None  # None = nota general de la evaluación
    author_id: str
    kind: ReviewKind
    text: str
    created: datetime
    payload: dict[str, str] | None = None  # p. ej. {"verdict": "valid"} en una corrección
