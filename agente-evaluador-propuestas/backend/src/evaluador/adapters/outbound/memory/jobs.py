"""Cola de trabajos, eventos y resultados en memoria. Misma semántica que pedirá el adaptador SQL:
`claim_next` es atómico (en SQL, `FOR UPDATE SKIP LOCKED`) y toda lectura filtra por tenant."""

from __future__ import annotations

import copy
import json
from dataclasses import replace
from threading import Lock
from typing import Any

from evaluador.domain.workflow import Job, JobEvent, JobStatus


class InMemoryJobs:
    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}
        self._order: list[str] = []  # orden de encolado: desempata trabajos creados en el mismo instante
        self._lock = Lock()

    def enqueue(self, job: Job) -> None:
        with self._lock:
            if job.id not in self._jobs:
                self._order.append(job.id)
            self._jobs[job.id] = job

    def claim_next(self) -> Job | None:
        with self._lock:
            queued = [j for j in self._jobs.values() if j.status is JobStatus.QUEUED]
            if not queued:
                return None
            oldest = min(queued, key=lambda j: (j.created, self._order.index(j.id)))
            claimed = replace(oldest, status=JobStatus.RUNNING)
            self._jobs[claimed.id] = claimed
            return claimed

    def update(self, job: Job) -> None:
        with self._lock:
            self._jobs[job.id] = job

    def by_id(self, tenant_id: str, job_id: str) -> Job | None:
        with self._lock:
            job = self._jobs.get(job_id)
        return job if job is not None and job.tenant_id == tenant_id else None

    def latest_for_project(self, tenant_id: str, project_id: str) -> Job | None:
        with self._lock:
            mine = [j for j in self._jobs.values() if j.tenant_id == tenant_id and j.project_id == project_id]
            if not mine:
                return None
            return max(mine, key=lambda j: (j.created, self._order.index(j.id)))


class InMemoryJobEvents:
    def __init__(self) -> None:
        self._events: dict[tuple[str, str], list[JobEvent]] = {}
        self._lock = Lock()

    def append(self, tenant_id: str, event: JobEvent) -> None:
        with self._lock:
            self._events.setdefault((tenant_id, event.job_id), []).append(event)

    def list_after(self, tenant_id: str, job_id: str, after_seq: int = 0) -> list[JobEvent]:
        with self._lock:
            events = list(self._events.get((tenant_id, job_id), []))
        return sorted((e for e in events if e.seq > after_seq), key=lambda e: e.seq)


class InMemoryResults:
    """Guarda una copia serializada: lo que se entrega y lo que se lee no comparten referencias."""

    def __init__(self) -> None:
        self._results: dict[tuple[str, str], str] = {}
        self._lock = Lock()

    def save(self, tenant_id: str, job_id: str, result: dict[str, Any]) -> None:
        with self._lock:
            self._results[(tenant_id, job_id)] = json.dumps(result, ensure_ascii=False)

    def get(self, tenant_id: str, job_id: str) -> dict[str, Any] | None:
        with self._lock:
            raw = self._results.get((tenant_id, job_id))
        return copy.deepcopy(json.loads(raw)) if raw is not None else None
