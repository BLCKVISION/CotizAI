"""POST /api/v1/transcriptions: foto de un presupuesto -> Markdown. Cuerpo binario crudo con ?archivo=<nombre>."""

import io
import os
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from evaluador.adapters.inbound.http.app import create_app
from evaluador.adapters.outbound.ai.fake_model import FakeModel
from evaluador.application.use_cases.transcription import TranscribeImage
from evaluador.composition.settings import Settings
from evaluador.domain.extraction import ImageTranscription
from tests.conftest import header

URL = "/api/v1/transcriptions"
TABLE = "# Proforma\n| Item | Total |\n|---|---|\n| Monitor | 1.100,00 |"
BINARY = {"Content-Type": "application/octet-stream"}


def png(size=(400, 300)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, (240, 240, 240)).save(buf, format="PNG")
    return buf.getvalue()


def noisy_png() -> bytes:
    """PNG de más de 1 MiB (el ruido no se comprime): una foto real pesa así."""
    buf = io.BytesIO()
    Image.frombytes("RGB", (800, 800), os.urandom(800 * 800 * 3)).save(buf, format="PNG")
    assert len(buf.getvalue()) > 1_048_576
    return buf.getvalue()


def with_vision(container, response: ImageTranscription | None):
    model = FakeModel({ImageTranscription: response}) if response else None
    return TestClient(create_app(Settings(log_level="CRITICAL"), replace(container, transcribe=TranscribeImage(model))))


@pytest.fixture
def client(container):
    return with_vision(container, ImageTranscription(markdown=TABLE))


def send(client, body: bytes, name: str | None = "presupuesto.png", **kw):
    url = URL if name is None else f"{URL}?archivo={name}"
    return client.post(url, content=body, headers={**header(client), **BINARY}, **kw)


def test_png_is_transcribed_to_markdown(client):
    r = send(client, png())
    assert r.status_code == 200
    assert r.json() == {"markdown": TABLE, "uncertain": [], "quality": "high", "notices": []}


def test_unreadable_photo_is_200_with_low_quality_and_review_notice(container):
    c = with_vision(container, ImageTranscription(unreadable=True, quality="low"))
    r = send(c, png())
    assert r.status_code == 200
    assert r.json()["quality"] == "low" and any("revisión humana" in n for n in r.json()["notices"])


def test_photo_over_one_mib_is_not_cut_by_the_json_body_limit(client):
    assert send(client, noisy_png()).status_code == 200


def test_pdf_is_rejected_as_not_an_image(client):
    r = send(client, b"%PDF-1.4\n" + b"x" * 50, name="presupuesto.pdf")
    assert r.status_code == 422 and r.json()["code"] == "invalid_data"


def test_extension_that_does_not_match_the_content_is_rejected(client):
    assert send(client, png(), name="presupuesto.jpg").status_code == 422


def test_empty_body_is_rejected(client):
    assert send(client, b"").status_code == 422


def test_png_signature_with_a_broken_body_is_rejected_not_a_500(client):
    assert send(client, b"\x89PNG\r\n\x1a\n" + b"\x00" * 32).status_code == 422


def test_missing_file_name_is_rejected(client):
    assert send(client, png(), name=None).status_code == 422


def test_oversize_body_is_413(client):
    r = send(client, b"\x89PNG\r\n\x1a\n" + b"\x00" * (26 * 1024 * 1024))
    assert r.status_code == 413


def test_without_vision_model_is_503_with_a_clear_message(container):
    r = send(with_vision(container, None), png())
    assert r.status_code == 503 and r.json()["code"] == "service_unavailable"


def test_requires_a_session(client):
    assert client.post(f"{URL}?archivo=a.png", content=png(), headers=BINARY).status_code == 401


def test_role_without_load_permission_is_403(client):
    h = {**header(client, role="auditor"), **BINARY}
    assert client.post(f"{URL}?archivo=a.png", content=png(), headers=h).status_code == 403


def test_provider_failure_is_503_without_leaking_its_detail(container):
    def boom(_image: str):
        raise RuntimeError("clave sk-secreta rechazada por el proveedor")

    model = FakeModel({ImageTranscription: boom})
    c = TestClient(create_app(Settings(log_level="CRITICAL"), replace(container, transcribe=TranscribeImage(model))))
    r = send(c, png())
    assert r.status_code == 503 and r.json()["code"] == "service_unavailable"
    assert "sk-secreta" not in r.text
    assert "admita imágenes" in r.json()["message"]  # pista útil: el fallo típico es un modelo sin visión
