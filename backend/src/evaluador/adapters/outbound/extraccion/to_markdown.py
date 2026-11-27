"""Picks the extractor by file type: pdfplumber for PDF, openpyxl for XLSX, OCR for images and scanned pages."""

from __future__ import annotations

from collections.abc import Callable
from pathlib import PurePath

from evaluador.application.ports.documentos import MarkdownDocument, OcrEngine
from evaluador.application.ports.transcription import ImageTranscriber
from evaluador.domain.errores import DatoInvalido, ServicioNoDisponible

from .lector import detect_kind
from .markdown_pdf import pdf_to_markdown
from .markdown_xlsx import xlsx_to_markdown
from .pdf_scanned import MAX_SCANNED_PAGES, render_pages


class DocumentToMarkdown:
    def __init__(self, image_reader: ImageTranscriber, ocr: Callable[[], OcrEngine | None]) -> None:
        self._image_reader, self._ocr = image_reader, ocr

    def __call__(self, filename: str, data: bytes) -> MarkdownDocument:
        kind = detect_kind(filename, data)
        if kind == "pdf":
            return self._pdf(filename, data)
        if kind == "xlsx":
            markdown, notices = xlsx_to_markdown(data)
            return MarkdownDocument(markdown, "openpyxl (XLSX)", tuple(notices))
        read = self._image_reader(filename, data)
        engine = "Tesseract OCR" if read.engine == "ocr" else "IA con visión"
        return MarkdownDocument(read.markdown, f"{engine} (imagen)", read.notices)

    def _pdf(self, filename: str, data: bytes) -> MarkdownDocument:
        markdown, notices, scanned = pdf_to_markdown(data)
        if not scanned:
            return MarkdownDocument(markdown, "pdfplumber (PDF)", tuple(notices))
        if len(scanned) > MAX_SCANNED_PAGES:
            raise DatoInvalido(f"El PDF tiene más de {MAX_SCANNED_PAGES} páginas escaneadas.")
        sections = [markdown] if markdown else []
        engines = set()
        for number, png in render_pages(data, scanned):
            try:
                read = self._image_reader(f"{PurePath(filename).stem}-{number}.png", png)
            except ServicioNoDisponible as error:
                notices.append(f"p.{number}: {error}")
                continue
            engines.add("Tesseract OCR" if read.engine == "ocr" else "IA con visión")
            sections.append(f"## Página {number} (escaneada)\n\n{read.markdown}")
            notices.extend(f"p.{number}: {n}" for n in read.notices)
        used = " + ".join(["pdfplumber", *sorted(engines)])
        return MarkdownDocument("\n\n".join(sections), f"{used} (PDF)", tuple(notices))
