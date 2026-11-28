"""Adaptador del puerto MotorDeEvaluacion sobre LangGraph."""

from __future__ import annotations

import time
from dataclasses import replace

from evaluador.application.ports.agente import Embebedor, IndiceVectorial, ModeloDeLenguaje
from evaluador.application.ports.market_search import MarketPriceFinder
from evaluador.application.ports.trace import current_trace
from evaluador.domain.decision_trace import TraceStep, describe_node, safe_summary
from evaluador.domain.evaluacion import ResultadoEvaluacion
from evaluador.domain.trace_events import EventType, StepStatus

from .estado import EstadoEvaluacion
from .grafo import construir_grafo
from .nodos import NodosEvaluacion

# What each kind of step is, in the vocabulary of the live trace. The mapping is by what the code did.
_EVENT_TYPE = {
    "context": EventType.TOOL_RESULT,
    "extraction": EventType.TOOL_RESULT,
    "market": EventType.TOOL_RESULT,
    "verdict": EventType.DECISION,
}
_TOOL = {"context": "document_reader", "extraction": "llm_extraction", "market": "market_search"}


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
        sink = current_trace()
        who = {"proposal_id": propuesta_id}
        sink.emit(
            EventType.HYPOTHESIS, "Se evalúa una propuesta",
            "Se comprobará lectura, cuentas, reglas técnicas y alcance antes de decidir.", who,
        )  # fmt: skip
        started = time.monotonic()
        for chunk in self._grafo.stream(initial, stream_mode="updates"):
            for node, update in chunk.items():
                steps = describe_node(node, update or {}, len(texto))
                trail += steps
                elapsed = int((time.monotonic() - started) * 1000)
                started = time.monotonic()
                for step in steps:
                    sink.emit(
                        _EVENT_TYPE.get(step.step, EventType.REFLECTION), step.title, safe_summary(step, update or {}),
                        {**who, "tool": _TOOL.get(step.step), "node": node, "latency_ms": elapsed,
                         "status": StepStatus.FAILED.value if step.status == "alert" else StepStatus.COMPLETED.value},
                    )  # fmt: skip
                result = (update or {}).get("resultado", result)
        assert result is not None  # noqa: S101 - every path of the graph ends in "decidir"
        return replace(result, trace=tuple(trail))
