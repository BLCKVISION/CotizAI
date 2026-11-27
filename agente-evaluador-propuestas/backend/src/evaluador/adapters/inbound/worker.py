"""Worker: consulta la cola cada pocos segundos y ejecuta los trabajos. `python -m evaluador.worker`.

La construcción de dependencias vive en la raíz de composición (`evaluador.composition.worker.build_worker`, que
devuelve un objeto con `execute() -> Job | None`); aquí solo está el bucle y la parada ordenada por SIGTERM/SIGINT.
"""

from __future__ import annotations

import argparse
import importlib
import logging
import os
import signal
import threading
from collections.abc import Callable, Sequence
from types import FrameType
from typing import Protocol, cast

from evaluador.observability.log import configure_logs

_log = logging.getLogger("evaluador.worker")
DEFAULT_INTERVAL_S = 2.0


class Step(Protocol):
    def execute(self) -> object | None:
        """Procesa el siguiente trabajo; devuelve None si la cola está vacía."""
        ...


def run_worker(step: Step, *, interval: float, stop: threading.Event) -> int:
    """Bucle del worker. Con trabajo pendiente no espera; sin trabajo duerme `interval` (interrumpible por `stop`).
    Un fallo del paso se registra (solo el tipo) y el bucle sigue. Devuelve cuántos trabajos procesó."""
    processed = 0
    while not stop.is_set():
        try:
            if step.execute() is not None:
                processed += 1
                continue
        except Exception as exc:  # noqa: BLE001 - un trabajo defectuoso no puede matar al worker
            _log.error("worker_step_failed", extra={"type": type(exc).__name__})
        stop.wait(interval)
    return processed


def _default_factory() -> Step:
    # Import tardío: solo el proceso real necesita la composición (y esta puede no existir en un entorno de pruebas).
    module = importlib.import_module("evaluador.composition.worker")
    return cast(Step, module.build_worker())


def _interval_from_env() -> float:
    try:
        return float(os.environ.get("EVALUADOR_WORKER_INTERVAL", DEFAULT_INTERVAL_S))
    except ValueError:
        return DEFAULT_INTERVAL_S


def main(
    argv: Sequence[str] | None = None,
    *,
    factory: Callable[[], Step] | None = None,
    stop: threading.Event | None = None,
) -> int:
    parser = argparse.ArgumentParser(prog="python -m evaluador.worker", description="Worker de evaluaciones.")
    parser.add_argument("--interval", type=float, default=_interval_from_env(), help="Segundos entre consultas.")
    args = parser.parse_args(argv)
    configure_logs(os.environ.get("EVALUADOR_LOG_LEVEL", "INFO"))

    try:
        step = (factory or _default_factory)()
    except Exception as exc:  # noqa: BLE001 - arranque fallido: salida clara y código distinto de cero
        _log.error("worker_start_failed", extra={"type": type(exc).__name__})
        return 2

    stop = stop or threading.Event()

    def _request_stop(signum: int, _frame: FrameType | None) -> None:
        _log.info("worker_stopping", extra={"signal": signal.Signals(signum).name})
        stop.set()  # termina el trabajo en curso y sale; no se corta a mitad

    previous = {s: signal.signal(s, _request_stop) for s in (signal.SIGTERM, signal.SIGINT)}
    try:
        _log.info("worker_started", extra={"interval": args.interval})
        processed = run_worker(step, interval=max(0.0, args.interval), stop=stop)
        _log.info("worker_stopped", extra={"processed": processed})
    finally:
        for s, handler in previous.items():
            signal.signal(s, handler)
    return 0
