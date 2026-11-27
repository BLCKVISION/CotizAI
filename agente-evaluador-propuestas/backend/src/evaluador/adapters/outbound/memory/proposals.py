"""Repositorio de propuestas en memoria (pruebas y desarrollo). Aísla por tenant igual que el adaptador SQL."""

from __future__ import annotations

from threading import Lock

from evaluador.domain.workflow import Proposal


class InMemoryProposals:
    def __init__(self) -> None:
        self._data: dict[tuple[str, str], Proposal] = {}  # (tenant_id, proposal_id)
        self._lock = Lock()

    def save(self, proposal: Proposal) -> None:
        with self._lock:
            self._data[(proposal.tenant_id, proposal.id)] = proposal

    def by_id(self, tenant_id: str, proposal_id: str) -> Proposal | None:
        with self._lock:
            return self._data.get((tenant_id, proposal_id))

    def list_for_project(self, tenant_id: str, project_id: str) -> list[Proposal]:
        with self._lock:
            found = [p for p in self._data.values() if p.tenant_id == tenant_id and p.project_id == project_id]
        return sorted(found, key=lambda p: (p.created, p.id))

    def delete(self, tenant_id: str, proposal_id: str) -> None:
        with self._lock:
            self._data.pop((tenant_id, proposal_id), None)
