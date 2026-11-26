"""Modo lote: procesa carpeta de propuestas en paralelo, con reintentos, y ordena el ranking.

Un archivo que falla tras los reintentos NO se omite ni se descarta: queda `pendiente_de_revision` y se ordena
después de las válidas. Los errores que no mejoran al repetir (`ErrorDeDominio`: tipo no admitido, archivo corrupto)
no se reintentan.
"""

from __future__ import annotations

import logging
import time
from collections import Counter
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from pathlib import PurePath

from evaluador.application.use_cases.evaluate_file import Evaluation, ProposalEvaluator
from evaluador.domain.errors import DomainError
from evaluador.domain.evaluation import Verdict
from evaluador.domain.ranking import Candidate, sort_ranking

_log = logging.getLogger("evaluador.lote")


@dataclass(frozen=True, slots=True)
class Processed:
    file: str
    proposal_id: str
    timestamp: datetime  # fin del último intento
    verdict: Verdict
    attempts: int
    error: str | None = None  # sin contenido del documento: solo tipo de error o mensaje de dominio


@dataclass(frozen=True, slots=True)
class BatchResult:
    start: datetime
    end: datetime
    processed: tuple[Processed, ...]
    ranking: tuple[str, ...]


def _unique_ids(files: list[str]) -> list[str]:
    """Nombre sin extensión; si dos archivos lo comparten, se distinguen con su extensión (el ranking no repite)."""
    paths = [PurePath(a) for a in files]
    counts = Counter(p.stem for p in paths)
    ids = [p.stem if counts[p.stem] == 1 else f"{p.stem}_{p.suffix.lstrip('.').lower()}" for p in paths]
    if len(set(ids)) != len(ids):  # caso extremo: A.pdf y A.PDF
        ids = [f"{i}~{n}" if ids.count(i) > 1 else i for n, i in enumerate(ids)]
    return ids


def _now() -> datetime:
    return datetime.now().astimezone()  # con zona horaria local (ISO 8601)


class ProcessBatch:
    def __init__(
        self,
        *,
        evaluador: ProposalEvaluator,
        load: Callable[[str], bytes],
        clock: Callable[[], datetime] = _now,
        wait: Callable[[float], None] = time.sleep,
        parallel: int = 4,
        retries: int = 2,
        base_pause_s: float = 1.0,
    ) -> None:
        self._evaluator, self._load, self._clock, self._wait = evaluador, load, clock, wait
        self._parallel, self._retries, self._pause = max(1, parallel), max(0, retries), base_pause_s

    def _process(self, file: str, proposal_id: str) -> tuple[Processed, Evaluation | None]:
        error: str | None = None
        for attempt in range(1, self._retries + 2):
            try:
                ev = self._evaluator.evaluate(proposal_id=proposal_id, name=file, data=self._load(file))
                return Processed(file, proposal_id, self._clock(), ev.result.verdict, attempt), ev
            except Exception as exc:  # noqa: BLE001 - un archivo no puede detener el lote
                deterministic = isinstance(exc, DomainError)
                error = str(exc) if deterministic else type(exc).__name__  # nunca contenido del documento
                _log.warning("file_failed", extra={"file": file, "attempt": attempt, "error": error})
                if deterministic or attempt > self._retries:
                    break
                self._wait(self._pause * attempt)
        pending = Processed(file, proposal_id, self._clock(), Verdict.PENDING_REVIEW, attempt, error)
        return pending, None

    def execute(self, files: list[str]) -> BatchResult:
        start = self._clock()
        ids = _unique_ids(files)
        with ThreadPoolExecutor(max_workers=self._parallel) as pool:
            outputs = list(pool.map(self._process, files, ids))
        evaluations = [e for _, e in outputs if e is not None and e.result.verdict is Verdict.VALID]
        # El costo solo desempata entre monedas iguales: sin tasa vigente no se comparan montos de monedas distintas.
        single_currency = len({e.currency for e in evaluations}) <= 1
        candidates = []
        for p, e in outputs:
            cost: Decimal | None = e.real_cost if (e and single_currency) else None
            verdict = p.verdict
            if verdict is Verdict.VALID and (e is None or e.score is None):
                verdict = Verdict.PENDING_REVIEW  # válida sin puntaje no se puede ordenar: revisión humana
            candidates.append(Candidate(p.proposal_id, verdict, e.score if e else None, cost))
        return BatchResult(start, self._clock(), tuple(p for p, _ in outputs), sort_ranking(candidates))
