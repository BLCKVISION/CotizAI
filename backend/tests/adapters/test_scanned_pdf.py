"""Scanned PDFs (pages without a text layer) are rendered and transcribed with the vision model."""

from __future__ import annotations

import io

import pytest
from PIL import Image

from evaluador.adapters.outbound.extraccion import pdf_scanned
from evaluador.adapters.outbound.extraccion.lector import leer_documento
from evaluador.domain.errores import DatoInvalido
from evaluador.domain.extraccion import TranscripcionImagen


def scanned_pdf(pages: int = 1) -> bytes:
    images = [Image.new("RGB", (600, 800), (200, 200, 200)) for _ in range(pages)]
    buffer = io.BytesIO()
    images[0].save(buffer, format="PDF", save_all=True, append_images=images[1:])
    return buffer.getvalue()


class Vision:
    def __init__(self, illegible: bool = False) -> None:
        self.calls: list[str] = []
        self.illegible = illegible

    def estructurar_imagen(self, *, instrucciones, imagen, mime, esquema):
        assert imagen.startswith(b"\x89PNG")
        self.calls.append(mime)
        return TranscripcionImagen(texto="Total USD 100", ilegible=self.illegible)


def test_every_scanned_page_is_transcribed_with_its_page_mark():
    vision = Vision()
    content = leer_documento("oferta.pdf", scanned_pdf(2), vision)
    assert len(vision.calls) == 2
    assert "[p.1 escaneada]" in content.texto and "[p.2 escaneada]" in content.texto
    assert not content.incomplete


def test_illegible_scan_is_marked_for_human_review():
    assert leer_documento("oferta.pdf", scanned_pdf(), Vision(illegible=True)).incomplete


def test_without_vision_no_text_is_invented():
    assert leer_documento("oferta.pdf", scanned_pdf()).texto == ""


def test_too_many_scanned_pages_are_refused_instead_of_read_partially():
    with pytest.raises(DatoInvalido):
        leer_documento("oferta.pdf", scanned_pdf(pdf_scanned.MAX_SCANNED_PAGES + 1), Vision())
