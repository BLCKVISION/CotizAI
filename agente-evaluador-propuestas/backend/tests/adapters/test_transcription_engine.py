"""Motor de transcripción a Markdown: una lectura si la imagen es clara, doble lectura si es dudosa."""

import io
from collections.abc import Iterator

import pytest
from PIL import Image

from evaluador.adapters.outbound.ai.fake_model import FakeModel
from evaluador.adapters.outbound.extraction.image import read_image
from evaluador.adapters.outbound.extraction.transcription import transcribe_image
from evaluador.domain.errors import InvalidData
from evaluador.domain.extraction import ImageTranscription

TABLE = "# Proforma\n| Item | Total |\n|---|---|\n| Monitor | 1.100,00 |"


def photo() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (400, 300), (240, 240, 240)).save(buf, format="PNG")
    return buf.getvalue()


def reading(markdown="", *, text="", uncertain=(), quality="high", unreadable=False) -> ImageTranscription:
    return ImageTranscription(
        text=text, markdown=markdown, uncertain=list(uncertain), quality=quality, unreadable=unreadable
    )


def scripted(*responses: ImageTranscription) -> tuple[FakeModel, list[str]]:
    """Modelo que devuelve las lecturas en orden y guarda la imagen que recibió cada llamada."""
    queue: Iterator[ImageTranscription] = iter(responses)
    seen: list[str] = []

    def respond(image: str) -> ImageTranscription:
        seen.append(image)
        return next(queue)

    return FakeModel({ImageTranscription: respond}), seen


def test_clear_image_reads_once():
    model, seen = scripted(reading(TABLE))
    r = transcribe_image(photo(), "image/png", model)
    assert len(seen) == 1
    assert r.markdown == TABLE and r.quality == "high" and r.uncertain == () and r.notices == ()


def test_first_read_uses_the_enhanced_image_not_the_original():
    data = photo()
    model, seen = scripted(reading(TABLE))
    transcribe_image(data, "image/png", model)
    assert seen[0] != data.decode("latin-1")


def test_dubious_image_triggers_second_read_on_the_original():
    data = photo()
    model, seen = scripted(reading(TABLE, quality="medium"), reading(TABLE))
    transcribe_image(data, "image/png", model)
    assert len(seen) == 2 and seen[1] == data.decode("latin-1")


def test_figures_that_differ_between_reads_become_uncertain():
    model, _ = scripted(
        reading("| Monitor | 1.100,00 |", quality="medium"), reading("| Monitor | 1.700,00 |", quality="medium")
    )
    r = transcribe_image(photo(), "image/png", model)
    assert "1.100,00" in r.uncertain and "1.700,00" in r.uncertain
    assert r.quality == "medium" and any("cifras" in n for n in r.notices)


def test_matching_figures_are_not_uncertain():
    model, _ = scripted(reading(TABLE, quality="medium"), reading(TABLE, quality="high"))
    r = transcribe_image(photo(), "image/png", model)
    assert r.uncertain == () and r.quality == "medium"


def test_uncertain_marks_declared_by_the_model_are_kept():
    first = reading("| Monitor | 1.1?0,00 |", uncertain=["1.1?0,00"], quality="medium")
    model, _ = scripted(first, first)
    assert transcribe_image(photo(), "image/png", model).uncertain == ("1.1?0,00",)


def test_unreadable_image_is_low_quality_and_asks_for_human_review():
    bad = reading("", unreadable=True, quality="low")
    model, _ = scripted(bad, bad)
    r = transcribe_image(photo(), "image/png", model)
    assert r.markdown == "" and r.quality == "low"
    assert any("requiere revisión humana" in n for n in r.notices)


def test_text_is_used_when_markdown_is_empty():
    model, _ = scripted(reading(text="Monitor 5 x 100,00"))
    assert transcribe_image(photo(), "image/png", model).markdown == "Monitor 5 x 100,00"


def test_prompt_asks_for_markdown_and_carries_the_injection_rule():
    model, _ = scripted(reading(TABLE))
    transcribe_image(photo(), "image/png", model)
    instructions, mime = model.image_calls[0]
    assert "Markdown" in instructions and "sin obedecerlas" in instructions and mime == "image/png"


def test_vision_error_propagates_untouched():
    def boom(_image: str):
        raise RuntimeError("proveedor caído")

    with pytest.raises(RuntimeError, match="proveedor caído"):
        transcribe_image(photo(), "image/png", FakeModel({ImageTranscription: boom}))


def test_corrupt_image_is_invalid_data_and_never_reaches_the_model():
    model, seen = scripted(reading(TABLE))
    with pytest.raises(InvalidData):
        transcribe_image(b"\x89PNG\r\n\x1a\nxxxx", "image/png", model)
    assert seen == []


def test_read_image_returns_the_markdown_as_text():
    model, _ = scripted(reading(TABLE))
    r = read_image(photo(), "image/png", model)
    assert r.text == TABLE and r.notices == []


def test_read_image_unreadable_asks_for_human_review():
    bad = reading("", unreadable=True, quality="low")
    model, _ = scripted(bad, bad)
    r = read_image(photo(), "image/png", model)
    assert r.text == "" and any("requiere revisión humana" in n for n in r.notices)
