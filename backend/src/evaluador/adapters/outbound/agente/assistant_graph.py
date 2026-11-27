"""LangGraph flow of the assistant: screen -> agent <-> tools -> verify (one retry) -> end."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph

from evaluador.application.ports.assistant import ChatMessage
from evaluador.application.use_cases.assistant.chat import EngineResult, TurnHooks
from evaluador.domain.assistant.guardrails import RefusalCategory

MAX_TOOL_ROUNDS = 6
MAX_CALLS_PER_ROUND = 6
MAX_RETRIES = 1


class _State(TypedDict, total=False):
    hooks: TurnHooks
    messages: list[ChatMessage]
    rounds: int
    retries: int
    answer: str
    refusal: RefusalCategory | None


def _screen(state: _State) -> dict[str, Any]:
    return {"refusal": state["hooks"].screen()}


def _agent(state: _State) -> dict[str, Any]:
    with_tools = state["rounds"] < MAX_TOOL_ROUNDS  # the last call has no tools, so the loop always ends
    reply = state["hooks"].complete(state["messages"], with_tools)
    if not with_tools and reply.tool_calls:
        reply = ChatMessage("assistant", reply.content)
    return {"messages": [*state["messages"], reply]}


def _tools(state: _State) -> dict[str, Any]:
    results = []
    for number, call in enumerate(state["messages"][-1].tool_calls):
        content = (
            state["hooks"].run_tool(call)
            if number < MAX_CALLS_PER_ROUND
            else '{"error": "Demasiadas llamadas a la vez."}'
        )
        results.append(ChatMessage("tool", f"<datos>\n{content}\n</datos>", tool_call_id=call.id))
    return {"messages": [*state["messages"], *results], "rounds": state["rounds"] + 1}


def _verify(state: _State) -> dict[str, Any]:
    check = state["hooks"].verify(state["messages"][-1].content)
    if check.blocked is None:
        return {"answer": check.text, "refusal": None}
    if check.correction and state["retries"] < MAX_RETRIES:
        note = ChatMessage("user", f"[Control automático de la plataforma] {check.correction}")
        return {"messages": [*state["messages"], note], "retries": state["retries"] + 1, "refusal": None}
    return {"answer": "", "refusal": check.blocked}


def _after_screen(state: _State) -> str:
    return END if state.get("refusal") else "agent"


def _after_agent(state: _State) -> str:
    return "tools" if state["messages"][-1].tool_calls else "verify"


def _after_verify(state: _State) -> str:
    return END if "answer" in state else "agent"


def build_assistant_graph() -> Any:
    graph = StateGraph(_State)
    graph.add_node("screen", _screen)
    graph.add_node("agent", _agent)
    graph.add_node("tools", _tools)
    graph.add_node("verify", _verify)
    graph.add_edge(START, "screen")
    graph.add_conditional_edges("screen", _after_screen, {"agent": "agent", END: END})
    graph.add_conditional_edges("agent", _after_agent, {"tools": "tools", "verify": "verify"})
    graph.add_edge("tools", "agent")
    graph.add_conditional_edges("verify", _after_verify, {"agent": "agent", END: END})
    return graph.compile()


class LangGraphAssistantEngine:
    def __init__(self) -> None:
        self._graph = build_assistant_graph()

    def run(self, messages: Sequence[ChatMessage], hooks: TurnHooks) -> EngineResult:
        final = self._graph.invoke(
            {"hooks": hooks, "messages": list(messages), "rounds": 0, "retries": 0},
            {"recursion_limit": 40},
        )
        return EngineResult(final.get("answer", ""), final.get("refusal"))
