"""Consulta y verificación de la auditoría. Solo el rol auditor; siempre dentro del tenant del actor."""

from __future__ import annotations

from dataclasses import dataclass

from evaluador.application.ports.workflow import AuditTrailRepository
from evaluador.domain.audit_trail import AuditEntry, verify_chain
from evaluador.domain.errors import InvalidData
from evaluador.domain.identity import Permission, User

MAX_PAGE = 200


@dataclass(frozen=True, slots=True)
class Verification:
    intact: bool
    first_invalid_seq: int | None
    entries: int


class ListAudit:
    def __init__(self, trail: AuditTrailRepository) -> None:
        self._trail = trail

    def execute(self, actor: User, *, after_seq: int = 0, limit: int = 100) -> list[AuditEntry]:
        actor.require(Permission.VIEW_AUDIT)
        if after_seq < 0 or limit < 1:
            raise InvalidData("Paginación inválida.")
        entries = [e for e in self._trail.list_for(actor.tenant_id) if e.seq > after_seq]
        return sorted(entries, key=lambda e: e.seq)[: min(limit, MAX_PAGE)]


class VerifyAudit:
    def __init__(self, trail: AuditTrailRepository) -> None:
        self._trail = trail

    def execute(self, actor: User) -> Verification:
        actor.require(Permission.VIEW_AUDIT)
        entries = self._trail.list_for(actor.tenant_id)
        first_invalid = verify_chain(entries)
        return Verification(intact=first_invalid is None, first_invalid_seq=first_invalid, entries=len(entries))
