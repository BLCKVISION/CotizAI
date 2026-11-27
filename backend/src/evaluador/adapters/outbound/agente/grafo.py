"""Definición del grafo LangGraph. Cambiar el flujo = cambiar solo este archivo."""

from __future__ import annotations

from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph

from .estado import EstadoEvaluacion
from .nodos import NodosEvaluacion


def _tras_extraer(s: EstadoEvaluacion) -> str:
    return "decidir" if s.get("error_de_lectura") else "manipulacion"


def construir_grafo(
    nodos: NodosEvaluacion,
) -> CompiledStateGraph[EstadoEvaluacion, None, EstadoEvaluacion, EstadoEvaluacion]:
    g = StateGraph(EstadoEvaluacion)
    # LangGraph's node protocol asks for a parameter named `state`; these nodes call it `s`, which only mypy minds.
    g.add_node("recuperar_contexto", nodos.recuperar_contexto)  # type: ignore[call-overload]
    g.add_node("extraer", nodos.extraer)  # type: ignore[call-overload]
    g.add_node("manipulacion", nodos.manipulacion)  # type: ignore[call-overload]
    g.add_node("aritmetica", nodos.aritmetica)  # type: ignore[call-overload]
    g.add_node("reglas_tecnicas", nodos.reglas_tecnicas)  # type: ignore[call-overload]
    g.add_node("alcance", nodos.alcance)  # type: ignore[call-overload]
    g.add_node("decidir", nodos.decidir)  # type: ignore[call-overload]

    g.add_edge(START, "recuperar_contexto")
    g.add_edge("recuperar_contexto", "extraer")
    g.add_conditional_edges("extraer", _tras_extraer, {"decidir": "decidir", "manipulacion": "manipulacion"})
    g.add_edge("manipulacion", "aritmetica")
    g.add_edge("aritmetica", "reglas_tecnicas")
    g.add_edge("reglas_tecnicas", "alcance")
    g.add_edge("alcance", "decidir")
    g.add_edge("decidir", END)
    return g.compile()
