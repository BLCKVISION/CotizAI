"""Rúbrica de puntuación: el modelo puntúa cada criterio con evidencia; el código suma con los pesos."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .amounts import to_cents
from .errors import InvalidData


class CriterionScore(BaseModel):
    # forbid + strict: es salida de un modelo; un campo mal escrito o un «80» como texto debe fallar y releerse.
    model_config = ConfigDict(extra="forbid")

    score: int = Field(strict=True, ge=0, le=100)
    evidence: list[str] = Field(default_factory=list, max_length=10)

    @field_validator("evidence")
    @classmethod
    def _clean_evidence(cls, quotes: list[str]) -> list[str]:
        return [c.strip() for c in quotes if c.strip()]

    @model_validator(mode="after")
    def _requires_evidence(self) -> CriterionScore:
        # Un puntaje sin cita no es auditable: se rechaza y el motor relee o pide revisión humana.
        if self.score > 0 and not any(c.strip() for c in self.evidence):
            raise ValueError("Un puntaje mayor que cero necesita evidencia citada.")
        return self


class ScoredRubric(BaseModel):
    """Salida del modelo para el orden de las válidas (sección 3.3 del diseño)."""

    model_config = ConfigDict(extra="forbid")

    performance: CriterionScore  # programación, 3D y video; uniformidad y ampliación
    protection_and_peripherals: CriterionScore
    warranty_and_support: CriterionScore


@dataclass(frozen=True, slots=True)
class Weights:
    """Pesos iniciales propuestos; el comité puede ajustarlos con las muestras. Deben sumar 100."""

    performance: int = 55
    protection_and_peripherals: int = 20
    warranty_and_support: int = 25

    def __post_init__(self) -> None:
        weights = (self.performance, self.protection_and_peripherals, self.warranty_and_support)
        if any(type(x) is not int for x in weights) or min(weights) < 0 or sum(weights) != 100:
            raise InvalidData("Los pesos deben ser enteros no negativos que sumen 100.")


def total_score(rubric: ScoredRubric, weights: Weights | None = None) -> Decimal:
    """Promedio ponderado en 0..100, con dos decimales."""
    weights = weights or Weights()
    total_sum = (
        rubric.performance.score * weights.performance
        + rubric.protection_and_peripherals.score * weights.protection_and_peripherals
        + rubric.warranty_and_support.score * weights.warranty_and_support
    )
    return to_cents(Decimal(total_sum) / 100)
