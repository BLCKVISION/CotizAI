"""Adaptador del puerto MotorDeEvaluacion sobre LangGraph."""

from __future__ import annotations

from dataclasses import replace

from evaluador.application.ports.agente import Embebedor, IndiceVectorial, ModeloDeLenguaje
from evaluador.application.ports.market_search import MarketPriceFinder
from evaluador.domain.decision_trace import TraceStep, describe_node
from evaluador.domain.evaluacion import ResultadoEvaluacion

from .estado import EstadoEvaluacion
from .grafo import construir_grafo
from .nodos import NodosEvaluacion


class MotorLangGraph:
    def __init__(
        self,
        modelo: ModeloDeLenguaje,
        embebedor: Embebedor,
        indice: IndiceVectorial,
        market_finder: MarketPriceFinder | None = None,
    ) -> None:
        self._grafo = construir_grafo(NodosEvaluacion(modelo, embebedor, indice, market_finder=market_finder))

    def evaluar(self, *, tenant_id: str, propuesta_id: str, requerimiento: str, texto: str) -> ResultadoEvaluacion:
        initial: EstadoEvaluacion = {
            "tenant_id": tenant_id,
            "propuesta_id": propuesta_id,
            "requerimiento": requerimiento,
            "texto": texto,
            "hallazgos": [],
        }
        trail: list[TraceStep] = []
        result: ResultadoEvaluacion | None = None
        for chunk in self._grafo.stream(initial, stream_mode="updates"):
            for node, update in chunk.items():
                trail += describe_node(node, update or {}, len(texto))
                result = (update or {}).get("resultado", result)
        assert result is not None  # noqa: S101 - every path of the graph ends in "decidir"
        return replace(result, trace=tuple(trail))
