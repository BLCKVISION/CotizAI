"""Exportación de reportes de una evaluación. El reporte presenta cifras del resultado; nunca las recalcula."""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass
from enum import StrEnum
from typing import Protocol

from evaluador.application.ports.output import Audit
from evaluador.domain.errors import InvalidData, NotFound
from evaluador.domain.identity import Permission, User
from evaluador.domain.result import ResultOut


class ReportFormat(StrEnum):
    PDF = "pdf"
    MD = "md"
    XLSX = "xlsx"
    CSV = "csv"


@dataclass(frozen=True, slots=True)
class ReportInput:
    result: ResultOut
    project_name: str
    notes: tuple[str, ...] = ()  # notas de revisión ya validadas (texto plano)


@dataclass(frozen=True, slots=True)
class RenderedReport:
    content: bytes
    media_type: str
    extension: str


@dataclass(frozen=True, slots=True)
class ExportedReport:
    filename: str
    content: bytes
    media_type: str


class ReportRenderer(Protocol):
    def render(self, data: ReportInput) -> RenderedReport: ...


class ResultSource(Protocol):
    def get(self, tenant_id: str, job_id: str) -> ResultOut | None: ...


class ProjectNames(Protocol):
    def name_of(self, tenant_id: str, project_id: str) -> str | None: ...


_FORMATS_HELP = ", ".join(f.value for f in ReportFormat)


def safe_filename(project_name: str | None, date: str, extension: str) -> str:
    """Nombre ASCII sin separadores de ruta ni espacios: seguro en `Content-Disposition` y en cualquier sistema."""
    base = re.sub(r"[^A-Za-z0-9]+", "-", (project_name or "").encode("ascii", "ignore").decode()).strip("-")
    return f"report-{base[:60] + '-' if base else ''}{date}.{extension}"


class ExportReport:
    def __init__(
        self,
        results: ResultSource,
        project_names: ProjectNames,
        renderers: Mapping[ReportFormat, ReportRenderer],
        audit: Audit,
    ) -> None:
        self._results, self._names, self._renderers, self._audit = results, project_names, renderers, audit

    def execute(
        self, actor: User, evaluation_id: str, report_format: str, notes: tuple[str, ...] = ()
    ) -> ExportedReport:
        actor.require(Permission.VIEW_RESULTS)
        try:
            fmt = ReportFormat(report_format.strip().lower())
        except ValueError:
            raise InvalidData(f"Formato de reporte no admitido. Use uno de: {_FORMATS_HELP}.") from None
        result = self._results.get(actor.tenant_id, evaluation_id)  # siempre el tenant del actor
        if result is None:
            raise NotFound("No se encontró la evaluación.")
        name = self._names.name_of(actor.tenant_id, result.project_id)
        rendered = self._renderers[fmt].render(ReportInput(result, name or "Proyecto", notes))
        self._audit.register(
            tenant_id=actor.tenant_id, actor=actor.id, action="report_exported", detail=f"{evaluation_id}:{fmt.value}"
        )
        filename = safe_filename(name, result.generated.strftime("%Y%m%d"), rendered.extension)
        return ExportedReport(filename, rendered.content, rendered.media_type)
