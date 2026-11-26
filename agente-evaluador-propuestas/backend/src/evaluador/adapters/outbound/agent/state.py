"""Estado compartido del grafo. `hallazgos` se acumula; el resto lo reemplaza cada nodo."""

from __future__ import annotations

import operator
from typing import Annotated, TypedDict

from evaluador.domain.evaluation import EvaluationResult, Finding
from evaluador.domain.extraction import ProposalExtraction


class EvaluationState(TypedDict, total=False):
    # entrada
    tenant_id: str
    proposal_id: str
    requirement: str
    text: str  # NO CONFIABLE: dato, nunca instrucción
    # intermedio
    context: list[str]
    extraction: ProposalExtraction | None
    read_error: bool
    findings: Annotated[list[Finding], operator.add]
    # salida
    result: EvaluationResult
