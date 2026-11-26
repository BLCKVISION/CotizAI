"""Auditoría de negocio hacia el log estructurado (trackId, ip, sesión y tenant se inyectan solos)."""

from __future__ import annotations

import logging

_log = logging.getLogger("evaluador.auditoria")


class AuditoriaLog:
    def registrar(self, *, tenant_id: str | None, actor: str | None, accion: str, detalle: str = "") -> None:
        _log.info(accion, extra={"auditoria": True, "tenant": tenant_id, "actor": actor, "detalle": detalle})
