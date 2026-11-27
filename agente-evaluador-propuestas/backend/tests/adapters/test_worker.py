import os
import signal
import threading

from evaluador.adapters.inbound.worker import main, run_worker


class ScriptedStep:
    """Devuelve trabajos mientras queden en `script`; una excepción en el guion simula un fallo del paso."""

    def __init__(self, script, stop: threading.Event | None = None, stop_after: int | None = None) -> None:
        self.script, self.calls, self._stop, self._stop_after = list(script), 0, stop, stop_after

    def execute(self):
        self.calls += 1
        if self._stop is not None and self._stop_after is not None and self.calls >= self._stop_after:
            self._stop.set()
        item = self.script.pop(0) if self.script else None
        if isinstance(item, Exception):
            raise item
        return item


def test_loop_keeps_going_without_waiting_while_there_is_work_and_stops_on_event():
    stop = threading.Event()
    step = ScriptedStep(["j1", "j2", "j3"], stop, stop_after=4)
    processed = run_worker(step, interval=60.0, stop=stop)  # con trabajo no espera: si esperara, el test tardaría 60 s
    assert processed == 3 and step.calls == 4


def test_loop_waits_the_interval_when_idle(monkeypatch):
    stop = threading.Event()
    waits: list[float] = []

    def fake_wait(timeout=None):
        waits.append(timeout)
        if len(waits) == 2:
            stop.set()
        return stop.is_set()

    monkeypatch.setattr(stop, "wait", fake_wait)
    step = ScriptedStep([])
    assert run_worker(step, interval=2.0, stop=stop) == 0
    assert waits == [2.0, 2.0] and step.calls == 2


def test_a_failing_step_does_not_kill_the_worker():
    stop = threading.Event()
    step = ScriptedStep([RuntimeError("boom"), "j1"], stop, stop_after=3)
    processed = run_worker(step, interval=0.001, stop=stop)
    assert processed == 1 and step.calls == 3


def test_stop_set_before_start_returns_immediately():
    stop = threading.Event()
    stop.set()
    step = ScriptedStep(["j1"])
    assert run_worker(step, interval=0.001, stop=stop) == 0 and step.calls == 0


def test_main_stops_in_an_orderly_way_on_sigterm():
    step = ScriptedStep([])
    before = signal.getsignal(signal.SIGTERM)
    timer = threading.Timer(0.3, lambda: os.kill(os.getpid(), signal.SIGTERM))
    timer.start()
    try:
        code = main(["--interval", "0.01"], factory=lambda: step)
    finally:
        timer.cancel()
    assert code == 0 and step.calls > 0
    assert signal.getsignal(signal.SIGTERM) is before  # restaura los manejadores previos


def test_main_fails_cleanly_when_the_factory_cannot_build(caplog):
    def broken():
        raise RuntimeError("sin base de datos")

    assert main(["--interval", "0.01"], factory=broken) == 2


def test_main_reads_the_interval_from_the_environment(monkeypatch):
    monkeypatch.setenv("EVALUADOR_WORKER_INTERVAL", "0.01")
    stop = threading.Event()
    step = ScriptedStep([], stop, stop_after=3)
    assert main([], factory=lambda: step, stop=stop) == 0 and step.calls == 3
