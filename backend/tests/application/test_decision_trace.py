import threading
from datetime import UTC, datetime

import pytest

from evaluador.adapters.outbound.memory.coleccion import ColeccionEnMemoria
from evaluador.application.ports.trace import NullTrace, bind_trace, current_trace
from evaluador.application.use_cases.decision_trace import MAX_EVENTS_PER_RUN, DecisionTraceStore
from evaluador.domain.errores import NoEncontrado, SinPermiso
from evaluador.domain.identidad import Rol, Usuario
from evaluador.domain.trace_events import EventType


class Clock:
    def ahora(self):
        return datetime(2026, 11, 28, tzinfo=UTC)


def user(role: Rol, tenant: str = "t1") -> Usuario:
    return Usuario(id=f"u-{role}", tenant_id=tenant, correo="a@b.c", hash_contrasena="x", rol=role)


@pytest.fixture
def store():
    counter = iter(range(10_000))
    return DecisionTraceStore(ColeccionEnMemoria(), Clock(), lambda: f"id{next(counter)}")


def test_events_are_ordered_sanitised_and_persisted_on_finish(store):
    run = store.start("t1", "p1")
    sink = store.sink("t1", run)
    sink.emit(EventType.TOOL_CALL, "Consultar", "Bearer abc123 fue usado", {"tool": "x", "password": "p"})
    sink.emit(EventType.FINAL_ANSWER, "Listo", "ok")
    store.finish("t1", run)
    result = store.trace(user(Rol.COORDINADOR), "p1", run)
    assert [e.seq for e in result.events] == [1, 2]
    assert "abc123" not in result.events[0].summary
    assert dict(result.events[0].metadata) == {"tool": "x"}
    assert result.status == "completed"


def test_resume_returns_only_events_after_seq(store):
    run = store.start("t1", "p1")
    for i in range(3):
        store.sink("t1", run).emit(EventType.REFLECTION, f"s{i}", "x")
    assert [e.seq for e in store.trace(user(Rol.COORDINADOR), "p1", run, after_seq=2).events] == [3]


@pytest.mark.parametrize("role", [r for r in Rol if r is not Rol.COORDINADOR])
def test_only_the_admin_role_reads_the_trace(store, role):
    run = store.start("t1", "p1")
    with pytest.raises(SinPermiso):
        store.trace(user(role), "p1", run)


def test_other_tenant_and_other_project_get_not_found(store):
    run = store.start("t1", "p1")
    with pytest.raises(NoEncontrado):
        store.trace(user(Rol.COORDINADOR, "t2"), "p1", run)
    with pytest.raises(NoEncontrado):
        store.trace(user(Rol.COORDINADOR), "other-project", run)


def test_failed_run_keeps_a_sanitised_error(store):
    run = store.start("t1", "p1")
    store.finish("t1", run, error="No se pudo leer. Bearer secret-token-value")
    got = store.trace(user(Rol.COORDINADOR), "p1", run)
    assert got.status == "failed" and "secret-token-value" not in got.error


def test_events_are_capped_but_the_final_answer_is_kept(store):
    run = store.start("t1", "p1")
    sink = store.sink("t1", run)
    for _ in range(MAX_EVENTS_PER_RUN + 50):
        sink.emit(EventType.REFLECTION, "s", "x")
    sink.emit(EventType.FINAL_ANSWER, "fin", "x")
    events = store.trace(user(Rol.COORDINADOR), "p1", run).events
    assert len(events) == MAX_EVENTS_PER_RUN + 1 and events[-1].type is EventType.FINAL_ANSWER


def test_wait_wakes_up_when_an_event_arrives(store):
    run = store.start("t1", "p1")
    threading.Timer(0.05, lambda: store.sink("t1", run).emit(EventType.HYPOTHESIS, "h", "x")).start()
    assert len(store.wait(user(Rol.COORDINADOR), "p1", run, 0, timeout=2).events) == 1


def test_wait_times_out_empty_without_events(store):
    run = store.start("t1", "p1")
    assert store.wait(user(Rol.COORDINADOR), "p1", run, 0, timeout=0.05).events == ()


def test_status_is_visible_to_whoever_can_start_runs_but_has_no_events(store):
    run = store.start("t1", "p1")
    store.sink("t1", run).emit(EventType.HYPOTHESIS, "h", "x")
    got = store.status(user(Rol.CARGADOR), "p1", run)
    assert got.events == () and got.status == "running"


def test_emitting_after_finish_is_ignored(store):
    run = store.start("t1", "p1")
    store.finish("t1", run)
    store.sink("t1", run).emit(EventType.REFLECTION, "late", "x")
    assert store.trace(user(Rol.COORDINADOR), "p1", run).events == ()


def test_current_trace_defaults_to_null_and_binds_per_context(store):
    assert isinstance(current_trace(), NullTrace)
    run = store.start("t1", "p1")
    sink = store.sink("t1", run)
    with bind_trace(sink):
        assert current_trace() is sink
    assert isinstance(current_trace(), NullTrace)
