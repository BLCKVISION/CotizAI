"""Auditoría encadenada: cada registro incluye el hash del anterior; alterar uno rompe la verificación."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime

GENESIS = "0" * 64


@dataclass(frozen=True, slots=True)
class AuditEntry:
    tenant_id: str
    seq: int  # creciente por tenant desde 1
    at: datetime
    actor: str | None
    action: str
    detail: str
    prev_hash: str
    hash: str


def compute_hash(
    *, tenant_id: str, seq: int, at: datetime, actor: str | None, action: str, detail: str, prev_hash: str
) -> str:
    body = json.dumps(
        [tenant_id, seq, at.isoformat(), actor, action, detail, prev_hash], ensure_ascii=False, separators=(",", ":")
    )
    return hashlib.sha256(body.encode("utf-8")).hexdigest()


def verify_chain(entries: list[AuditEntry]) -> int | None:
    """None si la cadena es íntegra; si no, el `seq` del primer registro inválido (alterado, borrado o reordenado)."""
    prev, expected = GENESIS, 1
    for e in entries:
        ok = (
            e.seq == expected
            and e.prev_hash == prev
            and e.hash
            == compute_hash(
                tenant_id=e.tenant_id,
                seq=e.seq,
                at=e.at,
                actor=e.actor,
                action=e.action,
                detail=e.detail,
                prev_hash=e.prev_hash,
            )
        )
        if not ok:
            return e.seq
        prev, expected = e.hash, expected + 1
    return None
