"""Proveedores y antecedentes: permite alertar si un RIF ya fue descartado en otra evaluación."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from .evaluation import Verdict


@dataclass(frozen=True, slots=True)
class Supplier:
    id: str
    tenant_id: str
    name: str
    rif: str | None = None  # clave de identidad cuando consta; se normaliza (mayúsculas, sin guiones ni espacios)
    location: str | None = None
    contact: str | None = None


@dataclass(frozen=True, slots=True)
class SupplierRecord:
    """Antecedente: qué pasó con este proveedor en una evaluación."""

    tenant_id: str
    supplier_id: str
    job_id: str
    project_id: str
    proposal_id: str
    verdict: Verdict
    reason: str  # causas de descarte resumidas (códigos y motivos), sin contenido de documentos
    at: datetime


def normalize_rif(rif: str | None) -> str | None:
    if rif is None:
        return None
    clean = "".join(ch for ch in rif.upper() if ch.isalnum())
    return clean or None
