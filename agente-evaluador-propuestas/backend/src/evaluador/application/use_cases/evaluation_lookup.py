"""Consulta mínima de una evaluación (trabajo) para los casos de uso de proveedores y revisión."""

from __future__ import annotations

from typing import Protocol

from evaluador.application.ports.workflow import JobRepository, ResultRepository


class EvaluationLookup(Protocol):
    def exists(self, tenant_id: str, job_id: str) -> bool: ...

    def proposal_ids(self, tenant_id: str, job_id: str) -> set[str] | None:
        """Ids de las propuestas evaluadas (los del ranking). `None` si la evaluación no existe en ese tenant;
        conjunto vacío si existe pero aún no tiene resultado."""
        ...


class RepositoryEvaluationLookup:
    """Implementación sobre los puertos de trabajos y resultados (la usa la raíz de composición)."""

    def __init__(self, jobs: JobRepository, results: ResultRepository) -> None:
        self._jobs, self._results = jobs, results

    def exists(self, tenant_id: str, job_id: str) -> bool:
        return self._jobs.by_id(tenant_id, job_id) is not None

    def proposal_ids(self, tenant_id: str, job_id: str) -> set[str] | None:
        if self._jobs.by_id(tenant_id, job_id) is None:
            return None
        result = self._results.get(tenant_id, job_id)
        return {str(p["id"]) for p in (result or {}).get("proposals", [])}
