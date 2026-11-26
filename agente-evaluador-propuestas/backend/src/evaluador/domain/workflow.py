"""Flujo de evaluación: propuestas cargadas, trabajos en cola y sus eventos de progreso."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum


class JobStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"


class EventKind(StrEnum):
    INFO = "info"
    READ = "read"  # lectura de un archivo
    SEARCH = "search"  # búsqueda de referencias o precios
    CALC = "calc"  # cálculo hecho por código
    DECISION = "decision"  # veredicto de una propuesta
    ERROR = "error"


@dataclass(frozen=True, slots=True)
class Proposal:
    """Archivo cargado. El contenido vive cifrado en el almacén; aquí solo su huella y su clave."""

    id: str
    tenant_id: str
    project_id: str
    filename: str
    sha256: str
    size_bytes: int
    storage_key: str
    uploaded_by: str
    created: datetime


@dataclass(frozen=True, slots=True)
class Job:
    """Una evaluación de todas las propuestas de un proyecto. `id` es también el id de la evaluación."""

    id: str
    tenant_id: str
    project_id: str
    requested_by: str
    created: datetime
    status: JobStatus = JobStatus.QUEUED
    attempts: int = 0
    started: datetime | None = None
    finished: datetime | None = None
    error: str | None = None  # nunca contenido de documentos


@dataclass(frozen=True, slots=True)
class JobEvent:
    job_id: str
    seq: int  # creciente por trabajo, desde 1: el cliente consulta «después de N»
    at: datetime
    kind: EventKind
    message: str  # sin contenido de documentos; solo nombres de archivo, conteos y veredictos
