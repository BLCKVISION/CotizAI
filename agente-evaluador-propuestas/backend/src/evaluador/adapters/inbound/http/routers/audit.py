"""Auditoría: listado paginado y verificación de la cadena. Solo el rol auditor.

CABLEADO: el Container debe exponer `list_audit` (ListAudit) y `verify_audit` (VerifyAudit).
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, ConfigDict

from evaluador.adapters.inbound.http.guards import require
from evaluador.application.use_cases.authentication import AuthenticatedSession
from evaluador.domain.audit_trail import AuditEntry
from evaluador.domain.identity import Permission

router = APIRouter(prefix="/audit", tags=["audit"])


class AuditEntryResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    seq: int
    at: datetime
    actor: str | None
    action: str
    detail: str
    prev_hash: str
    hash: str

    @classmethod
    def from_domain(cls, e: AuditEntry) -> AuditEntryResponse:
        return cls(
            seq=e.seq, at=e.at, actor=e.actor, action=e.action, detail=e.detail, prev_hash=e.prev_hash, hash=e.hash
        )


class VerificationResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    intact: bool
    first_invalid_seq: int | None
    entries: int


@router.get("")
def list_audit(
    request: Request,
    session: Annotated[AuthenticatedSession, Depends(require(Permission.VIEW_AUDIT))],
    after: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
) -> list[AuditEntryResponse]:
    entries = request.app.state.container.list_audit.execute(session.user, after_seq=after, limit=limit)
    return [AuditEntryResponse.from_domain(e) for e in entries]


@router.get("/verification")
def verify_audit(
    request: Request, session: Annotated[AuthenticatedSession, Depends(require(Permission.VIEW_AUDIT))]
) -> VerificationResponse:
    v = request.app.state.container.verify_audit.execute(session.user)
    return VerificationResponse(intact=v.intact, first_invalid_seq=v.first_invalid_seq, entries=v.entries)
