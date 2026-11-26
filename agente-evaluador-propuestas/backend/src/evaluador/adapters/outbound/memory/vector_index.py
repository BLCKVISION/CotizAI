"""Índice vectorial en memoria (pruebas). Mismo contrato y mismo aislamiento por tenant que pgvector."""

from __future__ import annotations

import threading

from evaluador.domain.rag import Chunk, SearchResult


class InMemoryIndex:
    def __init__(self) -> None:
        self._rows: list[tuple[Chunk, list[float]]] = []
        self._lock = threading.Lock()  # el modo lote evalúa varios archivos en paralelo sobre el mismo índice

    def index(self, chunks: list[Chunk], vectors: list[list[float]]) -> None:
        with self._lock:
            self._rows.extend(zip(chunks, vectors, strict=True))

    def search(
        self, *, tenant_id: str, vector: list[float], k: int, proposal_id: str | None = None
    ) -> list[SearchResult]:
        with self._lock:
            rows = list(self._rows)
        candidates = [
            SearchResult(f, sum(a * b for a, b in zip(v, vector, strict=True)))
            for f, v in rows
            if f.tenant_id == tenant_id and (proposal_id is None or f.proposal_id == proposal_id)
        ]
        return sorted(candidates, key=lambda r: r.score, reverse=True)[:k]

    def delete_proposal(self, *, tenant_id: str, proposal_id: str) -> None:
        with self._lock:
            self._rows = [
                (f, v) for f, v in self._rows if not (f.tenant_id == tenant_id and f.proposal_id == proposal_id)
            ]
