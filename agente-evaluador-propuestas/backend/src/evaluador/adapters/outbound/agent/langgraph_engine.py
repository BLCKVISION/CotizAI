"""Adaptador del puerto MotorDeEvaluacion sobre LangGraph."""

from __future__ import annotations

from evaluador.application.ports.agent import Embedder, LanguageModel, VectorIndex
from evaluador.application.ports.market import MarketPriceSource
from evaluador.domain.evaluation import EvaluationResult

from .graph import build_graph
from .nodes import EvaluationNodes


class LanggraphEngine:
    def __init__(
        self,
        model: LanguageModel,
        embedder: Embedder,
        index: VectorIndex,
        market: MarketPriceSource | None = None,
        min_references: int = 3,
    ) -> None:
        """`market` es opcional: sin fuente de precios el motor no consulta nada. `min_references` = fuentes
        distintas necesarias para descartar por sobreprecio."""
        self._graph = build_graph(EvaluationNodes(model, embedder, index, market=market, min_references=min_references))

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
        result: EvaluationResult = final["result"]
        return result
