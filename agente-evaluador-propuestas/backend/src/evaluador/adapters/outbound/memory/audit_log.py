"""Auditoría de negocio hacia el log estructurado (trackId, ip, sesión y tenant se inyectan solos)."""

from __future__ import annotations

import logging

_log = logging.getLogger("evaluador.audit")


class AuditLog:
    def register(self, *, tenant_id: str | None, actor: str | None, action: str, detail: str = "") -> None:
        _log.info(action, extra={"audit": True, "tenant": tenant_id, "actor": actor, "detail": detail})
