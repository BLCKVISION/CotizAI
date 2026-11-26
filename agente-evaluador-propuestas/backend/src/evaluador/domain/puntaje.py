"""Rúbrica de puntuación: el modelo puntúa cada criterio con evidencia; el código suma con los pesos."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .errores import DatoInvalido
from .montos import a_centavos


class PuntajeCriterio(BaseModel):
    # forbid + strict: es salida de un modelo; un campo mal escrito o un «80» como texto debe fallar y releerse.
    model_config = ConfigDict(extra="forbid")

    puntaje: int = Field(strict=True, ge=0, le=100)
    evidencia: list[str] = Field(default_factory=list, max_length=10)

    @field_validator("evidencia")
    @classmethod
    def _limpia_evidencia(cls, citas: list[str]) -> list[str]:
        return [c.strip() for c in citas if c.strip()]

    @model_validator(mode="after")
    def _exige_evidencia(self) -> PuntajeCriterio:
        # Un puntaje sin cita no es auditable: se rechaza y el motor relee o pide revisión humana.
        if self.puntaje > 0 and not any(c.strip() for c in self.evidencia):
            raise ValueError("Un puntaje mayor que cero necesita evidencia citada.")
        return self


class RubricaPuntuada(BaseModel):
    """Salida del modelo para el orden de las válidas (sección 3.3 del diseño)."""

    model_config = ConfigDict(extra="forbid")

    rendimiento: PuntajeCriterio  # programación, 3D y video; uniformidad y ampliación
    proteccion_y_perifericos: PuntajeCriterio
    garantia_y_soporte: PuntajeCriterio


@dataclass(frozen=True, slots=True)
class Pesos:
    """Pesos iniciales propuestos; el comité puede ajustarlos con las muestras. Deben sumar 100."""

    rendimiento: int = 55
    proteccion_y_perifericos: int = 20
    garantia_y_soporte: int = 25

    def __post_init__(self) -> None:
        pesos = (self.rendimiento, self.proteccion_y_perifericos, self.garantia_y_soporte)
        if any(type(x) is not int for x in pesos) or min(pesos) < 0 or sum(pesos) != 100:
            raise DatoInvalido("Los pesos deben ser enteros no negativos que sumen 100.")


def puntaje_total(rubrica: RubricaPuntuada, pesos: Pesos | None = None) -> Decimal:
    """Promedio ponderado en 0..100, con dos decimales."""
    pesos = pesos or Pesos()
    suma = (
        rubrica.rendimiento.puntaje * pesos.rendimiento
        + rubrica.proteccion_y_perifericos.puntaje * pesos.proteccion_y_perifericos
        + rubrica.garantia_y_soporte.puntaje * pesos.garantia_y_soporte
    )
    return a_centavos(Decimal(suma) / 100)
