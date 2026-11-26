"""Contrato de salida de una evaluación (`GET /evaluations/{id}`). Espejo de frontend/src/features/results/types.ts.

Los montos viajan como texto (Decimal). Quien consume solo presenta: no calcula ni decide.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .evaluation import FindingCode, Origin, Severity, Verdict


class _Out(BaseModel):
    model_config = ConfigDict(frozen=True)


class FindingOut(_Out):
    code: FindingCode
    severity: Severity
    discards: bool
    reason: str
    evidence: str
    origin: Origin


class AmountOut(_Out):
    literal: str
    value: str


class EvidenceOut(_Out):
    page_or_cell: str = ""
    text: str = ""


class LineOut(_Out):
    description: str
    category: str
    quantity: AmountOut | None = None
    unit_price: AmountOut | None = None
    line_total: AmountOut | None = None
    evidence: EvidenceOut = Field(default_factory=EvidenceOut)


class CostStepOut(_Out):
    item: str
    amount: str | None  # None = no determinado
    detail: str = ""


class CostOut(_Out):
    total: str | None  # None = indeterminado
    steps: list[CostStepOut] = Field(default_factory=list)


class CriterionOut(_Out):
    score: int
    evidence: list[str] = Field(default_factory=list)


class CriteriaOut(_Out):
    performance: CriterionOut
    protection_and_peripherals: CriterionOut
    warranty_and_support: CriterionOut


class ProposalResultOut(_Out):
    id: str  # nombre del archivo sin extensión (el mismo del ranking)
    supplier: str | None = None
    verdict: Verdict
    score: str | None = None  # solo las válidas
    currency: str | None = None
    criteria: CriteriaOut | None = None
    cost: CostOut
    findings: list[FindingOut] = Field(default_factory=list)
    lines: list[LineOut] = Field(default_factory=list)


class ResultOut(_Out):
    id: str  # id de la evaluación (= id del trabajo)
    project_id: str
    generated: datetime
    delta: str
    ranking: list[str]  # válidas por puntaje, luego pendientes, luego descartadas
    proposals: list[ProposalResultOut]
    status: Literal["queued", "running", "done", "failed"] = "done"
