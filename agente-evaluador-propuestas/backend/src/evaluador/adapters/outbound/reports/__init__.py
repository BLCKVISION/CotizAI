"""Renderizadores de reportes por formato. Añadir un formato = registrar un renderizador (abierto/cerrado)."""

from __future__ import annotations

from evaluador.application.use_cases.export_report import ReportFormat, ReportRenderer

from .csv_report import CsvReport
from .markdown import MarkdownReport
from .pdf import PdfReport
from .xlsx import XlsxReport

RENDERERS: dict[ReportFormat, ReportRenderer] = {
    ReportFormat.PDF: PdfReport(),
    ReportFormat.MD: MarkdownReport(),
    ReportFormat.XLSX: XlsxReport(),
    ReportFormat.CSV: CsvReport(),
}
