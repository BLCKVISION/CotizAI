"""Transcribes PDF pages that have no text layer: each page is rendered to PNG and read by the vision model.

Rendering the whole page (instead of pulling out embedded images) also covers JPEG 2000, fax-encoded scans, pages
split into several image strips and text drawn as vector outlines.
"""

from __future__ import annotations

import io
import threading
from dataclasses import replace

import pypdfium2 as pdfium

from evaluador.application.ports.agente import ModeloConVision
from evaluador.application.ports.documentos import ContenidoLeido
from evaluador.domain.errores import DatoInvalido

from .imagen import leer_imagen

MAX_SCANNED_PAGES = 8
_MAX_SIDE_PX = 2000  # enough to read small print; bounds memory for oversized page boxes
_BASE_SCALE = 2.0  # 144 dpi
_RENDER_LOCK = threading.Lock()  # PDFium is not thread safe and proposals are evaluated in parallel


def _render(data: bytes, pages: tuple[int, ...]) -> list[tuple[int, bytes]]:
    rendered: list[tuple[int, bytes]] = []
    try:
        with _RENDER_LOCK:
            document = pdfium.PdfDocument(data)
            try:
                for number in pages:
                    page = document[number - 1]
                    scale = min(_BASE_SCALE, _MAX_SIDE_PX / max(page.get_size()))
                    buffer = io.BytesIO()
                    page.render(scale=scale).to_pil().save(buffer, format="PNG")
                    rendered.append((number, buffer.getvalue()))
            finally:
                document.close()
    except Exception as exc:  # noqa: BLE001 - corrupt or hostile file: a file error, without internal detail
        raise DatoInvalido("No se pudieron leer las páginas escaneadas del PDF.") from exc
    return rendered


def read_scanned_pages(data: bytes, content: ContenidoLeido, vision: ModeloConVision) -> ContenidoLeido:
    """Appends the transcription of every scanned page. A model failure propagates so the caller can retry."""
    if len(content.scanned_pages) > MAX_SCANNED_PAGES:
        # Evaluating only part of a quotation could hide charges: refuse rather than guess.
        raise DatoInvalido(f"El PDF tiene más de {MAX_SCANNED_PAGES} páginas escaneadas.")
    sections = [content.texto] if content.texto.strip() else []
    warnings = [w for w in content.avisos if "sin texto" not in w]
    incomplete = content.incomplete
    for number, png in _render(data, content.scanned_pages):
        page = leer_imagen(png, "image/png", vision)
        if page.texto:
            sections.append(f"[p.{number} escaneada]\n{page.texto}")
        warnings.append(f"p.{number} escaneada: transcrita con visión")
        warnings.extend(f"p.{number}: {w}" for w in page.avisos)
        incomplete = incomplete or page.incomplete or not page.texto
    return replace(content, texto="\n".join(sections), avisos=warnings, incomplete=incomplete)
