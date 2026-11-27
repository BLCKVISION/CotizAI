"""Punta a punta: login real -> subir la foto borrosa de un presupuesto -> Markdown con lo dudoso marcado.

El modelo de visión es un `FakeModel`: lo que se prueba es la cadena real (autenticación, límites, preprocesado,
doble lectura y contrato de respuesta), no la IA.
"""

import io
from dataclasses import replace

from fastapi.testclient import TestClient
from PIL import Image, ImageDraw, ImageFilter

from evaluador.adapters.inbound.http.app import create_app
from evaluador.adapters.outbound.ai.fake_model import FakeModel
from evaluador.application.use_cases.transcription import TranscribeImage
from evaluador.composition.settings import Settings
from evaluador.domain.extraction import ImageTranscription
from tests.conftest import header

MARKDOWN = "# Proforma 0042\n| Item | Total |\n|---|---|\n| Monitor | 1.1?0,00 |"


def blurry_budget() -> bytes:
    """Foto pequeña y desenfocada de un presupuesto, como la que sacaría un móvil."""
    img = Image.new("RGB", (640, 420), "white")
    ImageDraw.Draw(img).text((30, 30), "PROFORMA 0042  Monitor 11 x 1.100,00", fill="black")
    buf = io.BytesIO()
    img.filter(ImageFilter.GaussianBlur(2)).save(buf, format="JPEG", quality=40)
    return buf.getvalue()


def test_blurry_photo_returns_markdown_with_the_dubious_figure_marked(container):
    reads = iter(
        [
            ImageTranscription(markdown=MARKDOWN, uncertain=["1.1?0,00"], quality="medium"),
            ImageTranscription(markdown=MARKDOWN, uncertain=["1.1?0,00"], quality="medium"),
        ]
    )
    model = FakeModel({ImageTranscription: lambda _image: next(reads)})
    app = create_app(Settings(log_level="CRITICAL"), replace(container, transcribe=TranscribeImage(model)))
    client = TestClient(app)

    r = client.post(
        "/api/v1/transcriptions?archivo=presupuesto.jpg",
        content=blurry_budget(),
        headers={**header(client), "Content-Type": "application/octet-stream"},
    )

    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"markdown", "uncertain", "quality", "notices"}
    assert body["markdown"] == MARKDOWN and body["uncertain"] == ["1.1?0,00"] and body["quality"] == "medium"
    assert any("cifras dudosas" in n for n in body["notices"])
    assert len(model.image_calls) == 2  # una imagen dudosa se lee dos veces: mejorada y original
