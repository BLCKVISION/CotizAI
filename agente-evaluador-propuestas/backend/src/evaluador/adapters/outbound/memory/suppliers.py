"""Proveedores y antecedentes en memoria. Mismo contrato y aislamiento por tenant que el adaptador SQL."""

from __future__ import annotations

import threading

from evaluador.domain.supplier import Supplier, SupplierRecord


def _norm(name: str) -> str:
    return " ".join(name.casefold().split())


class InMemorySuppliers:
    def __init__(self) -> None:
        self._suppliers: dict[tuple[str, str], Supplier] = {}
        self._records: list[SupplierRecord] = []
        self._lock = threading.Lock()  # el worker y la API pueden escribir a la vez

    def save(self, supplier: Supplier) -> None:
        with self._lock:
            self._suppliers[(supplier.tenant_id, supplier.id)] = supplier

    def by_id(self, tenant_id: str, supplier_id: str) -> Supplier | None:
        return self._suppliers.get((tenant_id, supplier_id))

    def by_rif(self, tenant_id: str, rif: str) -> Supplier | None:
        with self._lock:
            return next((s for (t, _), s in self._suppliers.items() if t == tenant_id and s.rif == rif), None)

    def by_name(self, tenant_id: str, name: str) -> Supplier | None:
        key = _norm(name)
        with self._lock:
            return next((s for (t, _), s in self._suppliers.items() if t == tenant_id and _norm(s.name) == key), None)

    def list_for(self, tenant_id: str) -> list[Supplier]:
        with self._lock:
            return [s for (t, _), s in self._suppliers.items() if t == tenant_id]

    def add_record(self, record: SupplierRecord) -> None:
        with self._lock:
            self._records.append(record)

    def records(self, tenant_id: str, supplier_id: str) -> list[SupplierRecord]:
        with self._lock:
            found = [r for r in self._records if r.tenant_id == tenant_id and r.supplier_id == supplier_id]
        return sorted(found, key=lambda r: r.at)
