"""Auditoría encadenada: repositorio en memoria y `Audit` que encadena cada registro con el anterior (por tenant)."""

from __future__ import annotations

from collections import defaultdict
from threading import Lock

from evaluador.application.ports.output import Clock
from evaluador.application.ports.workflow import AuditTrailRepository
from evaluador.domain.audit_trail import GENESIS, AuditEntry, compute_hash

from .audit_log import AuditLog

SYSTEM_TENANT = "system"  # cadena de los eventos sin tenant (arranque, errores globales)
MAX_DETAIL = 500


def clip_detail(detail: str) -> str:
    """El detalle lleva ids y códigos, nunca contenido de documentos: se acota para que no se cuele texto largo."""
    return detail if len(detail) <= MAX_DETAIL else detail[: MAX_DETAIL - 1] + "…"


class InMemoryAuditTrail:
    """Implementa `AuditTrailRepository`. Todo se filtra por tenant."""

    def __init__(self) -> None:
        self._entries: dict[str, list[AuditEntry]] = defaultdict(list)
        self._lock = Lock()

    def append(self, entry: AuditEntry) -> None:
        with self._lock:
            self._entries[entry.tenant_id].append(entry)

    def last(self, tenant_id: str) -> AuditEntry | None:
        with self._lock:
            chain = self._entries.get(tenant_id)
            return chain[-1] if chain else None

    def list_for(self, tenant_id: str) -> list[AuditEntry]:
        with self._lock:
            return list(self._entries.get(tenant_id, ()))


class ChainedAudit:
    """Implementa el puerto `Audit`: añade a la cadena del tenant y, además, emite el log estructurado de siempre."""

    def __init__(self, trail: AuditTrailRepository, clock: Clock, log: AuditLog | None = None) -> None:
        self._trail, self._clock, self._log = trail, clock, log or AuditLog()
        self._locks: defaultdict[str, Lock] = defaultdict(Lock)
        self._locks_guard = Lock()

    def _lock_for(self, tenant: str) -> Lock:
        with self._locks_guard:
            return self._locks[tenant]

    def register(self, *, tenant_id: str | None, actor: str | None, action: str, detail: str = "") -> None:
        tenant, detail = tenant_id or SYSTEM_TENANT, clip_detail(detail)
        with self._lock_for(tenant):  # leer el último y añadir es una sola sección crítica por tenant
            last = self._trail.last(tenant)
            seq, prev = (last.seq + 1, last.hash) if last else (1, GENESIS)
            at = self._clock.now()
            h = compute_hash(
                tenant_id=tenant, seq=seq, at=at, actor=actor, action=action, detail=detail, prev_hash=prev
            )
            self._trail.append(AuditEntry(tenant, seq, at, actor, action, detail, prev, h))
        self._log.register(tenant_id=tenant_id, actor=actor, action=action, detail=detail)
