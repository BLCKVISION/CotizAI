"""Definición del grafo LangGraph. Cambiar el flujo = cambiar solo este archivo."""

from __future__ import annotations

from langgraph.graph import END, START, StateGraph

from .nodes import EvaluationNodes
from .state import EvaluationState


def _after_extract(s: EvaluationState) -> str:
    return "decide" if s.get("read_error") else "manipulation"


def build_graph(nodes: EvaluationNodes):
    g = StateGraph(EvaluationState)
    g.add_node("retrieve_context", nodes.retrieve_context)
    g.add_node("extract", nodes.extract)
    g.add_node("manipulation", nodes.manipulation)
    g.add_node("arithmetic", nodes.arithmetic)
    g.add_node("technical_rules", nodes.technical_rules)
    g.add_node("scope", nodes.scope)
    g.add_node("decide", nodes.decide)

    g.add_edge(START, "retrieve_context")
    g.add_edge("retrieve_context", "extract")
    g.add_conditional_edges("extract", _after_extract, {"decide": "decide", "manipulation": "manipulation"})
    g.add_edge("manipulation", "arithmetic")
    g.add_edge("arithmetic", "technical_rules")
    g.add_edge("technical_rules", "scope")
    g.add_edge("scope", "decide")
    g.add_edge("decide", END)
    return g.compile()
