"""Revisiones humanas en memoria. Mismo contrato y aislamiento por tenant que el adaptador SQL."""

from __future__ import annotations

import threading

from evaluador.domain.review import Review


class InMemoryReviews:
    def __init__(self) -> None:
        self._reviews: list[Review] = []
        self._lock = threading.Lock()

    def add(self, review: Review) -> None:
        with self._lock:
            self._reviews.append(review)

    def list_for_job(self, tenant_id: str, job_id: str) -> list[Review]:
        with self._lock:
            found = [r for r in self._reviews if r.tenant_id == tenant_id and r.job_id == job_id]
        return sorted(found, key=lambda r: r.created)
