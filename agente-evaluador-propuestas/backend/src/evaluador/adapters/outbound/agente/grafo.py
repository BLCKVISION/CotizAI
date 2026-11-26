"""Definición del grafo LangGraph. Cambiar el flujo = cambiar solo este archivo."""

from __future__ import annotations

from langgraph.graph import END, START, StateGraph

from .estado import EstadoEvaluacion
from .nodos import NodosEvaluacion


def _tras_extraer(s: EstadoEvaluacion) -> str:
    return "decidir" if s.get("error_de_lectura") else "manipulacion"


def construir_grafo(nodos: NodosEvaluacion):
    g = StateGraph(EstadoEvaluacion)
    g.add_node("recuperar_contexto", nodos.recuperar_contexto)
    g.add_node("extraer", nodos.extraer)
    g.add_node("manipulacion", nodos.manipulacion)
    g.add_node("aritmetica", nodos.aritmetica)
    g.add_node("alcance", nodos.alcance)
    g.add_node("decidir", nodos.decidir)

    g.add_edge(START, "recuperar_contexto")
    g.add_edge("recuperar_contexto", "extraer")
    g.add_conditional_edges("extraer", _tras_extraer, {"decidir": "decidir", "manipulacion": "manipulacion"})
    g.add_edge("manipulacion", "aritmetica")
    g.add_edge("aritmetica", "alcance")
    g.add_edge("alcance", "decidir")
    g.add_edge("decidir", END)
    return g.compile()
