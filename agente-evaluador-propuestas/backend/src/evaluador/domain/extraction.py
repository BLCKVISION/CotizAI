"""Contrato central de extracción (sección 3.1 del diseño). Los montos viajan como texto: literal + normalizado.

El modelo solo transcribe; nunca recalcula. `null` (None) significa «no consta».
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class _Base(BaseModel):
    model_config = ConfigDict(extra="ignore")


class Amount(_Base):
    literal: str  # tal como aparece en el documento, p. ej. "1.100,00"
    value: str  # normalizado con punto decimal, p. ej. "1100.00"


class Evidence(_Base):
    page_or_cell: str = ""
    text: str = ""


class Line(_Base):
    description: str
    category: str  # gabinete | monitor | teclado | raton | protector | otro ...
    brand: str | None = None
    model: str | None = None
    specs: dict[str, str] = Field(default_factory=dict)
    quantity: Amount | None = None  # None = no consta (no se rellena con suposiciones)
    unit_price: Amount | None = None
    line_total: Amount | None = None
    evidence: Evidence = Field(default_factory=Evidence)
    legibility: Literal["high", "medium", "low"] = "high"


class Totals(_Base):
    subtotal: Amount | None = None
    taxes: list[Amount] = Field(default_factory=list)
    total: Amount | None = None


class Surcharge(_Base):
    """Cargo adicional. `monto` o `porcentaje`; si el cargo se anuncia sin cifra, el Monto lleva `valor` vacío."""

    item: str
    amount: Amount | None = None
    percentage: Amount | None = None  # sobre el subtotal


class Conditions(_Base):
    """Costos y cláusulas fuera de las líneas. `None` = no consta; un Monto con `valor` no numérico = «a convenir»."""

    freight: Amount | None = None
    installation: Amount | None = None
    surcharges: list[Surcharge] = Field(default_factory=list)
    warranty: str | None = None
    support: str | None = None
    software: list[str] = Field(default_factory=list)


class ProposalExtraction(_Base):
    supplier: str | None = None
    currency: str | None = None
    lines: list[Line] = Field(default_factory=list)
    totals: Totals = Field(default_factory=Totals)
    conditions: Conditions = Field(default_factory=Conditions)
    literal_notes: list[str] = Field(default_factory=list)
    manipulation_suspicions: list[str] = Field(default_factory=list)


class ScopeJudgment(_Base):
    """Salida del modelo para el alcance cualitativo (instalación, garantía, soporte)."""

    meets: bool
    missing: list[str] = Field(default_factory=list)
    evidence: list[str] = Field(default_factory=list)


class ImageTranscription(_Base):
    """Salida del modelo de visión: transcripción literal de una imagen (foto o captura de una propuesta)."""

    text: str = ""
    unreadable: bool = False  # True si la imagen no permite leer con fiabilidad: se pide revisión, no se inventa
    markdown: str = ""  # transcripción en Markdown (tablas como tablas); vacío = usar `text`
    uncertain: list[str] = Field(default_factory=list)  # cifras o fragmentos dudosos, tal como se marcaron con «?»
    quality: Literal["high", "medium", "low"] = "high"
