"""Auditoría de negocio: log estructurado y registro consultable con huellas encadenadas por tenant."""

from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import replace
from threading import Lock

from evaluador.application.ports.salida import Collection, GeneradorDeIds, Reloj
from evaluador.domain.gestion import Evento

_log = logging.getLogger("evaluador.auditoria")


def huella_de(e: Evento) -> str:
    base = [e.tenant_id, e.actor, e.accion, e.detalle, e.creado.isoformat(), e.secuencia, e.huella_anterior]
    return hashlib.sha256(json.dumps(base, ensure_ascii=False).encode()).hexdigest()


def cadena_integra(eventos: list[Evento]) -> bool:
    anterior = ""
    for n, e in enumerate(sorted(eventos, key=lambda x: x.secuencia), start=1):
        if e.secuencia != n or e.huella_anterior != anterior or e.huella != huella_de(e):
            return False
        anterior = e.huella
    return True


class AuditoriaLog:
    def __init__(
        self,
        eventos: Collection[Evento] | None = None,
        ids: GeneradorDeIds | None = None,
        reloj: Reloj | None = None,
    ) -> None:
        self._eventos, self._ids, self._reloj = eventos, ids, reloj
        self._lock = Lock()  # un solo proceso: la cadena no se bifurca

    def registrar(self, *, tenant_id: str | None, actor: str | None, accion: str, detalle: str = "") -> None:
        _log.info(accion, extra={"auditoria": True, "tenant": tenant_id, "actor": actor, "detalle": detalle})
        if self._eventos is None or not tenant_id:
            return
        if self._ids is None or self._reloj is None:
            raise RuntimeError("A persisted audit trail needs an id generator and a clock.")
        with self._lock:
            ultimo = max(self._eventos.listar(tenant_id), key=lambda e: e.secuencia, default=None)
            draft = Evento(
                id=self._ids.nuevo(),
                tenant_id=tenant_id,
                actor=actor,
                accion=accion,
                detalle=detalle,
                creado=self._reloj.ahora(),
                secuencia=ultimo.secuencia + 1 if ultimo else 1,
                huella_anterior=ultimo.huella if ultimo else "",
                huella="",
            )
            self._eventos.guardar(replace(draft, huella=huella_de(draft)))
