"""Definición del grafo LangGraph. Cambiar el flujo = cambiar solo este archivo."""

from __future__ import annotations

from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph

from .nodes import EvaluationNodes
from .state import EvaluationState


def _after_extract(s: EvaluationState) -> str:
    return "decide" if s.get("read_error") else "manipulation"


def build_graph(nodes: EvaluationNodes) -> CompiledStateGraph[EvaluationState, None, EvaluationState, EvaluationState]:
    g = StateGraph(EvaluationState)
    for name, action in (
        ("retrieve_context", nodes.retrieve_context),
        ("extract", nodes.extract),
        ("manipulation", nodes.manipulation),
        ("arithmetic", nodes.arithmetic),
        ("technical_rules", nodes.technical_rules),
        ("scope", nodes.scope),
        ("decide", nodes.decide),
    ):
        g.add_node(name, action)  # type: ignore[call-overload]  # los stubs de langgraph no resuelven TypedDict total=False

    g.add_edge(START, "retrieve_context")
    g.add_edge("retrieve_context", "extract")
    g.add_conditional_edges("extract", _after_extract, {"decide": "decide", "manipulation": "manipulation"})
    g.add_edge("manipulation", "arithmetic")
    g.add_edge("arithmetic", "technical_rules")
    g.add_edge("technical_rules", "scope")
    g.add_edge("scope", "decide")
    g.add_edge("decide", END)
    return g.compile()
