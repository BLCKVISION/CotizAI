"""Records, streams and reopens the decision trace of evaluation runs. Visible to the admin role only."""

from __future__ import annotations

import logging
import threading
from collections import Counter
from collections.abc import Callable, Mapping
from contextvars import copy_context
from dataclasses import replace
from typing import Any, Protocol

from evaluador.application.ports.salida import Reloj
from evaluador.application.ports.trace import bind_trace
from evaluador.application.use_cases.evaluate_project import EvaluateProject
from evaluador.domain.errores import ErrorDeDominio, NoEncontrado
from evaluador.domain.identidad import Permiso, Usuario
from evaluador.domain.project_evaluation import ProjectEvaluation
from evaluador.domain.trace_events import (
    MAX_TITLE,
    RUN_COMPLETED,
    RUN_FAILED,
    TERMINAL_RUN_STATES,
    EventType,
    StepStatus,
    TraceEvent,
    TraceRun,
    sanitize_metadata,
    sanitize_text,
)

_log = logging.getLogger(__name__)
MAX_EVENTS_PER_RUN = 300
MAX_LIVE_RUNS = 200


class TraceRunRepository(Protocol):
    def guardar(self, entidad: TraceRun) -> None: ...
    def por_id(self, tenant_id: str, entidad_id: str) -> TraceRun | None: ...


class DecisionTraceStore:
    """Live runs live in memory (so subscribers wake up at once); finished runs are persisted and dropped."""

    def __init__(self, runs: TraceRunRepository, clock: Reloj, new_id: Callable[[], str]) -> None:
        self._runs, self._clock, self._new_id = runs, clock, new_id
        self._live: dict[tuple[str, str], TraceRun] = {}
        self._changed = threading.Condition()

    # ---- writing (called by the running agent, no actor: the run was already authorised) ----
    def start(self, tenant_id: str, project_id: str) -> str:
        run = TraceRun(self._new_id(), tenant_id, self._clock.ahora(), project_id)
        with self._changed:
            if len(self._live) >= MAX_LIVE_RUNS:
                raise RuntimeError("too many live runs")
            self._live[(tenant_id, run.id)] = run
        return run.id

    def sink(self, tenant_id: str, run_id: str) -> RunSink:
        return RunSink(self, tenant_id, run_id)

    def _emit(
        self, tenant_id: str, run_id: str, type: EventType, title: str, summary: str, metadata: Mapping[str, Any] | None
    ) -> None:
        key = (tenant_id, run_id)
        with self._changed:
            run = self._live.get(key)
            if run is None or run.status in TERMINAL_RUN_STATES:
                return
            is_last = type is EventType.FINAL_ANSWER
            if len(run.events) >= MAX_EVENTS_PER_RUN and not is_last:
                return  # a runaway agent must not grow memory; the closing answer is always kept
            event = TraceEvent(
                id=self._new_id(), run_id=run_id, tenant_id=tenant_id, seq=len(run.events) + 1,
                timestamp=self._clock.ahora(), type=type, title=sanitize_text(title, MAX_TITLE),
                summary=sanitize_text(summary), metadata=sanitize_metadata(metadata),
            )  # fmt: skip
            self._live[key] = replace(run, events=(*run.events, event))
            self._changed.notify_all()

    def finish(self, tenant_id: str, run_id: str, *, error: str = "") -> None:
        key = (tenant_id, run_id)
        with self._changed:
            run = self._live.get(key)
            if run is None:
                return
            done = replace(run, status=RUN_FAILED if error else RUN_COMPLETED, error=sanitize_text(error))
            self._runs.guardar(done)  # persisted before it disappears from memory
            self._live[key] = done
            self._changed.notify_all()
        # keep it live briefly would complicate things: readers fall back to the repository from now on
        with self._changed:
            self._live.pop(key, None)

    # ---- reading (admin only) ----
    def _load(self, tenant_id: str, run_id: str) -> TraceRun | None:
        with self._changed:
            live = self._live.get((tenant_id, run_id))
        return live or self._runs.por_id(tenant_id, run_id)

    def status(self, actor: Usuario, project_id: str, run_id: str) -> TraceRun:
        """Run state without events: whoever may start an evaluation may follow whether it ended."""
        actor.exigir(Permiso.INICIAR_EVALUACION)
        run = self._load(actor.tenant_id, run_id)
        if run is None or run.project_id != project_id:
            raise NoEncontrado("Ejecución no encontrada.")
        return replace(run, events=())

    def trace(self, actor: Usuario, project_id: str, run_id: str, after_seq: int = 0) -> TraceRun:
        actor.exigir(Permiso.VIEW_DECISION_TRACE)
        run = self._load(actor.tenant_id, run_id)
        if run is None or run.project_id != project_id:
            raise NoEncontrado("Ejecución no encontrada.")
        return replace(run, events=tuple(e for e in run.events if e.seq > after_seq))

    def wait(self, actor: Usuario, project_id: str, run_id: str, after_seq: int, timeout: float) -> TraceRun:
        """Blocks until there is something after `after_seq`, the run ends, or `timeout` passes."""
        run = self.trace(actor, project_id, run_id, after_seq)
        if run.events or run.status in TERMINAL_RUN_STATES:
            return run
        with self._changed:
            self._changed.wait(timeout)
        return self.trace(actor, project_id, run_id, after_seq)


class RunSink:
    """The `TraceSink` of one run."""

    def __init__(self, store: DecisionTraceStore, tenant_id: str, run_id: str) -> None:
        self._store, self._tenant_id, self._run_id = store, tenant_id, run_id

    def emit(self, type: EventType, title: str, summary: str, metadata: Mapping[str, Any] | None = None) -> None:
        self._store._emit(self._tenant_id, self._run_id, type, title, summary, metadata)  # noqa: SLF001


class StartEvaluationRun:
    """Starts an evaluation in the background and reports what it does to the run's trace."""

    def __init__(self, store: DecisionTraceStore, evaluate: EvaluateProject) -> None:
        self._store, self._evaluate = store, evaluate

    def execute(self, actor: Usuario, project_id: str, selected: list[str] | None = None) -> str:
        actor.exigir(Permiso.INICIAR_EVALUACION)
        run_id = self._store.start(actor.tenant_id, project_id)
        # copy_context keeps the trackId of the request in the logs of the worker thread
        threading.Thread(
            target=copy_context().run, args=(self._work, actor, project_id, selected, run_id), daemon=True
        ).start()
        return run_id

    def _work(self, actor: Usuario, project_id: str, selected: list[str] | None, run_id: str) -> None:
        tenant_id = actor.tenant_id
        sink = self._store.sink(tenant_id, run_id)
        error = ""
        try:
            with bind_trace(sink):
                evaluation = self._evaluate.execute(actor, project_id, selected)
            sink.emit(EventType.FINAL_ANSWER, "Evaluación terminada", _closing_summary(evaluation),
                      {"count": len(evaluation.items), "status": StepStatus.COMPLETED.value})  # fmt: skip
        except ErrorDeDominio as exc:  # its message is written for people
            error = str(exc) or "La evaluación no se pudo completar."
        except Exception as exc:  # noqa: BLE001 - background thread: log the type, show a generic message
            _log.warning("evaluation_run_failed", extra={"tipo": type(exc).__name__})
            error = "La evaluación no se pudo completar. Intente de nuevo."
        if error:
            sink.emit(EventType.FINAL_ANSWER, "La evaluación falló", error, {"status": StepStatus.FAILED.value})
        self._store.finish(tenant_id, run_id, error=error)


def _closing_summary(evaluation: ProjectEvaluation) -> str:
    """Counts only: no file names or supplier names, which come from untrusted documents."""
    verdicts = Counter(i.verdict for i in evaluation.items)
    return (
        f"{len(evaluation.items)} propuestas: {verdicts.get('valida', 0)} válidas, "
        f"{verdicts.get('descartada', 0)} descartadas, {verdicts.get('pendiente_de_revision', 0)} por revisar."
    )
