"""Where the agent reports what it is doing. Business code never knows about SSE, storage or subscribers."""

from __future__ import annotations

from collections.abc import Iterator, Mapping
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any, Protocol

from evaluador.domain.trace_events import EventType


class TraceSink(Protocol):
    def emit(self, type: EventType, title: str, summary: str, metadata: Mapping[str, Any] | None = None) -> None: ...


class NullTrace:
    def emit(self, type: EventType, title: str, summary: str, metadata: Mapping[str, Any] | None = None) -> None:
        return None


_NULL = NullTrace()
# A context variable instead of a parameter: it crosses the use case, the file evaluator and the engine without
# changing their signatures, and `copy_context()` (already used for the worker threads) carries it along.
_current: ContextVar[TraceSink] = ContextVar("decision_trace_sink", default=_NULL)


def current_trace() -> TraceSink:
    return _current.get()


@contextmanager
def bind_trace(sink: TraceSink) -> Iterator[None]:
    token = _current.set(sink)
    try:
        yield
    finally:
        _current.reset(token)
