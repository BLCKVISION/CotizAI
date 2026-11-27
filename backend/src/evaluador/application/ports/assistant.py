"""Ports of the procurement assistant: a chat model that may request tools, web prices and report rendering."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any, Literal, Protocol

from evaluador.domain.assistant.analysis import Comparison, Recommendation
from evaluador.domain.project_evaluation import ProjectEvaluation
from evaluador.domain.proyecto import Proyecto
from evaluador.domain.reglas.abusivo import ReferenciaDeMercado

ReportFormat = Literal["pdf", "xlsx", "md", "csv"]
REPORT_MEDIA_TYPES: dict[str, str] = {
    "pdf": "application/pdf",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "md": "text/markdown; charset=utf-8",
    "csv": "text/csv; charset=utf-8",
}


@dataclass(frozen=True, slots=True)
class ToolSpec:
    name: str
    description: str
    parameters: dict[str, Any]  # JSON schema of the arguments


@dataclass(frozen=True, slots=True)
class ToolCall:
    id: str
    name: str
    arguments: str  # raw JSON written by the model: untrusted until validated


@dataclass(frozen=True, slots=True)
class ChatMessage:
    role: Literal["system", "user", "assistant", "tool"]
    content: str
    tool_calls: tuple[ToolCall, ...] = ()
    tool_call_id: str | None = None


class ChatModel(Protocol):
    def complete(self, messages: Sequence[ChatMessage], tools: Sequence[ToolSpec]) -> ChatMessage:
        """Returns the next assistant message, with tool calls when the model asks for data."""
        ...


class MarketPriceLookup(Protocol):
    def lookup(self, description: str, currency: str) -> ReferenciaDeMercado | None: ...


class ReportRenderer(Protocol):
    def evaluation(self, evaluation: ProjectEvaluation, project_name: str, fmt: ReportFormat) -> bytes: ...
    def comparison(self, comparison: Comparison, fmt: ReportFormat) -> bytes: ...
    def recommendations(
        self, project: Proyecto, recommendations: Sequence[Recommendation], fmt: ReportFormat
    ) -> bytes: ...
    def portfolio(self, rows: Sequence[dict[str, Any]], fmt: ReportFormat) -> bytes: ...
