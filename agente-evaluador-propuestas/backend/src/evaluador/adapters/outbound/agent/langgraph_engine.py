"""Adaptador del puerto MotorDeEvaluacion sobre LangGraph."""

from __future__ import annotations

from evaluador.application.ports.agent import Embedder, LanguageModel, VectorIndex
from evaluador.domain.evaluation import EvaluationResult

from .graph import build_graph
from .nodes import EvaluationNodes


class LanggraphEngine:
    def __init__(self, model: LanguageModel, embedder: Embedder, index: VectorIndex) -> None:
        self._graph = build_graph(EvaluationNodes(model, embedder, index))

    def evaluate(self, *, tenant_id: str, proposal_id: str, requirement: str, text: str) -> EvaluationResult:
        final = self._graph.invoke(
            {
                "tenant_id": tenant_id,
                "proposal_id": proposal_id,
                "requirement": requirement,
                "text": text,
                "findings": [],
            }  # fmt: skip
        )
        return final["result"]
