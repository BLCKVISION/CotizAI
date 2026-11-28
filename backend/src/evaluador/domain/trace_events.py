"""Live decision events: what the agent is doing right now, safe to show and to store.

Events are built from what the code did (node outputs, tool calls), never from model prose or document text, and
every free-text field goes through `sanitize_text` anyway: the trace is a second channel that must not leak
secrets, prompts or private documents.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Any

from .text_folding import strip_invisible

MAX_TITLE = 120
MAX_SUMMARY = 400
_REDACTED = "[censurado]"
_OMITTED = "[omitido]"
_BEARER = re.compile(r"(?i)\b(bearer|basic)\s+[\w.~+/=-]+")
# Long opaque strings are almost always keys or tokens (sk-..., JWTs, hex digests).
_OPAQUE = re.compile(r"\b[\w-]{28,}\b")
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
_RIF = re.compile(r"(?i)\b[JGVEPC]-?\d{7,9}(?:-?\d)?\b")
_LONG_NUMBER = re.compile(r"\d[\d .-]{7,}\d")  # phones, card or account numbers, ids
_UUID = re.compile(r"^[0-9a-fA-F-]{36}$")
_INTERNAL_IDS = frozenset({"proposal_id"})  # opaque ids of our own records: useful to group steps, not personal data
_SENSITIVE_KEY = re.compile(r"(?i)pass|secret|token|key|authorization|cookie|prompt|rif|credential")
_ALLOWED_METADATA = frozenset({"tool", "node", "latency_ms", "status", "confidence", "count", "proposal_id", "args"})
_MAX_ARGS = 8


class EventType(StrEnum):
    HYPOTHESIS = "hypothesis"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    REFLECTION = "reflection"
    DECISION = "decision"
    FINAL_ANSWER = "final_answer"


class StepStatus(StrEnum):
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


def sanitize_text(text: str, limit: int = MAX_SUMMARY) -> str:
    flat = " ".join(strip_invisible(text).split())
    flat = _BEARER.sub(lambda m: f"{m.group(1)} {_REDACTED}", flat)
    for pattern in (_EMAIL, _OPAQUE, _RIF, _LONG_NUMBER):
        flat = pattern.sub(_REDACTED, flat)
    return flat if len(flat) <= limit else f"{flat[: limit - 1]}…"


def _sanitize_args(args: Mapping[str, Any]) -> dict[str, Any]:
    clean: dict[str, Any] = {}
    for key, value in list(args.items())[:_MAX_ARGS]:
        name = sanitize_text(str(key), 40)
        if _SENSITIVE_KEY.search(name):
            clean[name] = _REDACTED
        elif isinstance(value, (int, float, bool)) or value is None:
            clean[name] = value
        elif isinstance(value, str):
            clean[name] = sanitize_text(value, 120)
        else:
            clean[name] = _OMITTED
    return clean


def sanitize_metadata(metadata: Mapping[str, Any] | None) -> dict[str, Any]:
    """Keeps only allow-listed keys. Anything else (prompts, headers, raw payloads) is dropped, not masked."""
    clean: dict[str, Any] = {}
    for key, value in (metadata or {}).items():
        if key not in _ALLOWED_METADATA:
            continue
        if key in _INTERNAL_IDS:
            if isinstance(value, str) and _UUID.match(value):
                clean[key] = value  # anything else is dropped, not masked
        elif key == "status":
            clean[key] = StepStatus(value).value
        elif key == "args" and isinstance(value, Mapping):
            clean[key] = _sanitize_args(value)
        elif isinstance(value, (int, float, bool)) or value is None:
            clean[key] = value
        elif isinstance(value, str):
            clean[key] = sanitize_text(value, 120)
    return clean


@dataclass(frozen=True, slots=True)
class TraceEvent:
    id: str
    run_id: str
    tenant_id: str  # never serialised: used only to filter reads
    seq: int  # strictly increasing per run; clients resume with it
    timestamp: datetime
    type: EventType
    title: str
    summary: str
    metadata: Mapping[str, Any] = field(default_factory=dict)

    def to_wire(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "runId": self.run_id,
            "seq": self.seq,
            "timestamp": self.timestamp.isoformat(),
            "type": self.type.value,
            "title": self.title,
            "summary": self.summary,
            "metadata": dict(self.metadata),
        }


RUN_RUNNING, RUN_COMPLETED, RUN_FAILED = "running", "completed", "failed"
TERMINAL_RUN_STATES = frozenset({RUN_COMPLETED, RUN_FAILED})


@dataclass(frozen=True, slots=True)
class TraceRun:
    """One evaluation run and everything it emitted. Stored encrypted and per tenant like any other record."""

    id: str  # the run id
    tenant_id: str
    creado: datetime
    project_id: str
    status: str = RUN_RUNNING
    error: str = ""  # a message meant for people (domain error text), never an exception dump
    events: tuple[TraceEvent, ...] = ()
