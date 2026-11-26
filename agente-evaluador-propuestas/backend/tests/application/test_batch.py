import threading
import time
from datetime import UTC, datetime
from decimal import Decimal

from evaluador.application.use_cases.batch import ProcessBatch
from evaluador.application.use_cases.evaluate_file import Evaluation
from evaluador.domain.errors import InvalidData
from evaluador.domain.evaluation import EvaluationResult, Verdict


def ev(name: str, verdict=Verdict.VALID, score="80", cost=None) -> Evaluation:
    return Evaluation(
        EvaluationResult(name, verdict), Decimal(score) if verdict is Verdict.VALID else None,
        Decimal(cost) if cost else None, "USD",
    )  # fmt: skip


class Fake:
    """Evaluador programable: `plan[propuesta_id]` es una lista de respuestas o excepciones, una por intento."""

    def __init__(self, plan: dict, delay: float = 0.0) -> None:
        self.plan, self.attempts, self.delay = plan, {}, delay
        self.active = self.max_active = 0
        self._lock = threading.Lock()

    def evaluate(self, *, proposal_id: str, name: str, data: bytes) -> Evaluation:
        with self._lock:
            self.attempts[proposal_id] = self.attempts.get(proposal_id, 0) + 1
            n = self.attempts[proposal_id]
            self.active += 1
            self.max_active = max(self.max_active, self.active)
        try:
            time.sleep(self.delay)
            r = self.plan.get(proposal_id, [ev(proposal_id)])
            r = r[min(n, len(r)) - 1]
            if isinstance(r, Exception):
                raise r
            return r
        finally:
            with self._lock:
                self.active -= 1


def batch(evaluador, **kw) -> ProcessBatch:
    return ProcessBatch(
        evaluador=evaluador, load=lambda n: b"x", clock=lambda: datetime.now(UTC), wait=lambda s: None, **kw
    )


def test_processes_each_file_and_ranking_uses_name_without_extension():
    r = batch(Fake({"A": [ev("A", score="90")], "B": [ev("B", score="70")]})).execute(["A.pdf", "B.xlsx"])
    assert [p.file for p in r.processed] == ["A.pdf", "B.xlsx"]
    assert r.ranking == ("A", "B")


def test_retries_and_continues_if_a_file_fails():
    f = Fake({"A": [RuntimeError("caído"), RuntimeError("caído"), ev("A")]})
    r = batch(f, retries=2).execute(["A.pdf", "B.pdf"])
    assert f.attempts["A"] == 3 and r.ranking == ("A", "B") and r.processed[0].error is None


def test_if_retries_are_exhausted_goes_to_pending_after_valid_ones_without_being_skipped():
    f = Fake({"A": [RuntimeError("caído")], "B": [ev("B", score="10")], "C": [ev("C", Verdict.DISCARDED)]})
    r = batch(f, retries=1).execute(["A.pdf", "B.pdf", "C.pdf"])
    assert f.attempts["A"] == 2
    assert r.ranking == ("B", "A", "C")  # válidas, pendiente (el fallido), descartadas
    a = r.processed[0]
    assert a.verdict is Verdict.PENDING_REVIEW and a.error == "RuntimeError" and a.attempts == 2


def test_invalid_file_error_is_not_retried_and_leaks_no_content():
    f = Fake({"A": [InvalidData("Tipo de archivo no admitido.")]})
    r = batch(f, retries=3).execute(["A.txt"])
    assert f.attempts["A"] == 1 and r.processed[0].error == "Tipo de archivo no admitido."
    assert r.ranking == ("A",)


def test_processes_in_parallel_with_configurable_limit():
    f = Fake({}, delay=0.05)
    files = [f"P{i}.pdf" for i in range(8)]
    batch(f, parallel=3).execute(files)
    assert f.max_active == 3
    f2 = Fake({}, delay=0.01)
    batch(f2, parallel=1).execute(files)
    assert f2.max_active == 1


def test_records_end_time_of_each_attempt_and_batch_start_end():
    r = batch(Fake({})).execute(["A.pdf"])
    assert r.start <= r.processed[0].timestamp <= r.end and r.processed[0].timestamp.tzinfo is not None


def test_repeated_names_without_extension_do_not_repeat_in_ranking():
    r = batch(Fake({})).execute(["A.pdf", "A.xlsx"])
    assert len(set(r.ranking)) == 2 and set(r.ranking) == {"A_pdf", "A_xlsx"}


def test_technical_equivalence_breaks_tie_by_cost_only_with_same_currency():
    def plan(currency_b):
        return Fake({
            "A": [Evaluation(EvaluationResult("A", Verdict.VALID), Decimal(81), Decimal(900), "USD")],
            "B": [Evaluation(EvaluationResult("B", Verdict.VALID), Decimal(79), Decimal(800), currency_b)],
        })  # fmt: skip

    assert batch(plan("USD")).execute(["A.pdf", "B.pdf"]).ranking == ("B", "A")  # a ≤ δ puntos gana el más barato
    assert batch(plan("VES")).execute(["A.pdf", "B.pdf"]).ranking == ("A", "B")  # monedas distintas: manda el puntaje


def test_no_files_gives_empty_batch():
    r = batch(Fake({})).execute([])
    assert r.processed == () and r.ranking == ()
