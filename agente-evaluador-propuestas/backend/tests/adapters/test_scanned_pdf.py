"""PDF escaneado: las páginas sin texto se renderizan y se transcriben con el modelo de visión."""

import io

import pytest
from PIL import Image

from evaluador.adapters.outbound.ai.fake_model import FakeModel
from evaluador.adapters.outbound.extraction.pdf import read_pdf
from evaluador.adapters.outbound.extraction.reader import read_document
from evaluador.domain.extraction import ImageTranscription
from tests.adapters.test_document_extraction import pdf_bytes


def scanned_pdf(pages: int = 1) -> bytes:
    """PDF cuyas páginas son solo una imagen (sin capa de texto), como un escaneo."""
    imgs = [Image.new("RGB", (400, 300), (255 - 10 * i, 255, 255)) for i in range(pages)]
    buf = io.BytesIO()
    imgs[0].save(buf, "PDF", save_all=True, append_images=imgs[1:], resolution=100)
    return buf.getvalue()


def vision(text="Monitor 11 x 100,00", unreadable=False) -> FakeModel:
    return FakeModel({ImageTranscription: ImageTranscription(text=text, unreadable=unreadable)})


def test_scanned_page_is_transcribed_with_vision_and_noted():
    v = vision()
    r = read_pdf(scanned_pdf(), vision=v)
    assert "[p.1]" in r.text and "Monitor 11 x 100,00" in r.text
    assert any("p.1" in n and "visión" in n for n in r.notices)
    assert len(v.image_calls) == 1 and v.image_calls[0][1] == "image/png"


def test_without_vision_keeps_the_previous_notice():
    r = read_pdf(scanned_pdf())
    assert r.text == "" and r.notices == ["p.1 sin texto (¿escaneada?)"]


def test_unreadable_scan_asks_for_human_review():
    r = read_pdf(scanned_pdf(), vision=vision(text="", unreadable=True))
    assert r.text == "" and any("ilegible" in n and "p.1" in n for n in r.notices)


def test_scanned_pages_are_capped_and_the_rest_is_noted():
    v = vision()
    r = read_pdf(scanned_pdf(3), vision=v, max_scanned_pages=2)
    assert len(v.image_calls) == 2
    assert any("p.3" in n and "límite" in n for n in r.notices)
    assert "[p.1]" in r.text and "[p.2]" in r.text and "[p.3]" not in r.text


def test_mixed_pdf_keeps_page_order_and_only_sends_scanned_pages_to_vision():
    texto = pdf_bytes(("Monitor 11 x 100,00", 12, "0 0 0"))
    from pypdf import PdfReader, PdfWriter

    w = PdfWriter()
    for src in (texto, scanned_pdf()):
        for page in PdfReader(io.BytesIO(src)).pages:
            w.add_page(page)
    buf = io.BytesIO()
    w.write(buf)
    v = vision("Transcrito de la imagen")
    r = read_pdf(buf.getvalue(), vision=v)
    assert r.text.index("[p.1]") < r.text.index("[p.2]") and "Monitor 11 x 100,00" in r.text
    assert "Transcrito de la imagen" in r.text and len(v.image_calls) == 1


def test_vision_failure_is_not_disguised_as_an_invalid_file():
    class Broken:
        def structure_image(self, **kw):
            raise TimeoutError("proveedor caído")

    with pytest.raises(TimeoutError):  # error transitorio: el lote lo reintenta; un archivo inválido no
        read_pdf(scanned_pdf(), vision=Broken())


def test_reader_passes_the_vision_model_to_pdfs():
    v = vision("Teclado 11 x 20,00")
    r = read_document("escaneo.pdf", scanned_pdf(), v)
    assert "Teclado 11 x 20,00" in r.text
