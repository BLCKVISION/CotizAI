"""API tests for image transcription (offline: scripted vision model)."""

from __future__ import annotations

import io
import json

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from evaluador.adapters.inbound.http.aplicacion import crear_aplicacion
from evaluador.adapters.outbound.extraccion.preprocess import MAX_LONG_SIDE, MIN_LONG_SIDE, enhance
from evaluador.adapters.outbound.ia._comun import sistema_para_imagen
from evaluador.composition.configuracion import Configuracion
from evaluador.composition.contenedor import construir_contenedor
from evaluador.domain.extraccion import ImageMarkdownReading
from evaluador.domain.identidad import Rol, Tenant, Usuario
from tests.conftest import CLAVE, cabecera

URL = "/api/v1/transcriptions"


class ScriptedVision:
    def __init__(self) -> None:
        self.replies: list[object] = []
        self.mimes: list[str] = []

    def estructurar_imagen(self, *, instrucciones, imagen, mime, esquema):
        self.mimes.append(mime)
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply


def image(kind: str = "JPEG", size: tuple[int, int] = (400, 300)) -> bytes:
    out = io.BytesIO()
    Image.new("RGB", size, "white").save(out, format=kind)
    return out.getvalue()


@pytest.fixture
def vision() -> ScriptedVision:
    return ScriptedVision()


@pytest.fixture
def client(vision):
    config = Configuracion(nivel_de_log="CRITICAL", persistencia="memoria", semilla_clave=None,
                           usuario_demo_correo=None, clave_cifrado=None)  # fmt: skip
    container = construir_contenedor(config=config, vision_model=vision)
    hashed = container.hasheador.hashear(CLAVE)
    container.tenants.guardar(Tenant(id="t-alfa", codigo="alfa", nombre="alfa"))
    for role in Rol:
        container.usuarios.guardar(Usuario(id=f"alfa-{role}", tenant_id="t-alfa", correo=f"{role}@alfa.test",
                                           hash_contrasena=hashed, rol=role))  # fmt: skip
    return TestClient(crear_aplicacion(config, container))


def send(client, data: bytes, name: str = "foto.jpg", role: str = "cargador"):
    headers = cabecera(client, rol=role) | {"Content-Type": "application/octet-stream"}
    return client.post(f"{URL}?archivo={name}", content=data, headers=headers)


def test_clear_image_is_read_once(client, vision):
    vision.replies = [ImageMarkdownReading(markdown="| Item | Total |\n|---|---|\n| Monitor | 1.100,00 |")]
    r = send(client, image())
    assert r.status_code == 200, r.text
    assert r.json() == {"markdown": "| Item | Total |\n|---|---|\n| Monitor | 1.100,00 |", "uncertain": [],
                        "quality": "high", "notices": []}  # fmt: skip
    assert vision.mimes == ["image/png"]


def test_doubtful_image_is_read_twice_and_differences_become_uncertain(client, vision):
    vision.replies = [ImageMarkdownReading(markdown="Total 1.100,00", quality="medium"),
                      ImageMarkdownReading(markdown="Total 1.700,00", quality="medium")]  # fmt: skip
    body = send(client, image()).json()
    assert {"1.100,00", "1.700,00"} <= set(body["uncertain"])
    assert body["quality"] == "medium" and vision.mimes == ["image/png", "image/jpeg"]


def test_failed_second_read_keeps_the_first(client, vision):
    vision.replies = [ImageMarkdownReading(markdown="Total 25,00", quality="medium"), RuntimeError("boom")]
    body = send(client, image()).json()
    assert body["markdown"] == "Total 25,00" and "segunda lectura" in body["notices"][0]


def test_provider_failure_is_503_without_details(client, vision):
    vision.replies = [RuntimeError("https://provider.test?key=sk-secret")]
    r = send(client, image())
    assert r.status_code == 503 and r.json()["codigo"] == "servicio_no_disponible"
    assert "sk-secret" not in r.text and "provider.test" not in r.text


@pytest.mark.parametrize(
    ("data", "name"),
    [(b"%PDF-1.4 x", "a.pdf"), (image("PNG"), "a.jpg"), (b"\xff\xd8\xffbroken", "a.jpg"), (b"", "a.jpg")],
)
def test_invalid_files_never_reach_the_model(client, vision, data, name):
    assert send(client, data, name).status_code == 422
    assert vision.mimes == []


@pytest.mark.parametrize("role", ["evaluador", "aprobador", "auditor"])
def test_requires_the_upload_permission(client, vision, role):
    assert send(client, image(), role=role).status_code == 403
    assert vision.mimes == []


def test_requires_a_session(client):
    assert client.post(f"{URL}?archivo=a.jpg", content=image()).status_code == 401


def test_accepts_images_above_the_json_limit_and_rejects_above_25_mib(client, vision):
    vision.replies = [ImageMarkdownReading(markdown="ok")]
    padded = image() + b"0" * (2 * 1024 * 1024)
    assert send(client, padded).status_code == 200
    r = send(client, b"0" * (25 * 1024 * 1024 + 1))
    assert r.status_code == 413 and r.json()["codigo"] == "payload_demasiado_grande"


@pytest.mark.parametrize(("size", "long_side"), [((400, 300), MIN_LONG_SIDE), ((5000, 1000), MAX_LONG_SIDE)])
def test_preprocessing_keeps_the_long_side_within_bounds(size, long_side):
    assert max(Image.open(io.BytesIO(enhance(image(size=size)))).size) == long_side


def test_a_reply_that_echoes_the_schema_is_rejected_instead_of_read_as_empty():
    with pytest.raises(ValueError):
        ImageMarkdownReading.model_validate(ImageMarkdownReading.model_json_schema())


def test_image_prompt_shows_an_example_object_instead_of_the_schema():
    prompt = sistema_para_imagen("x", ImageMarkdownReading)
    assert '"properties"' not in prompt
    example = json.loads(prompt.splitlines()[-1])
    assert list(example) == ["markdown", "unreadable", "uncertain", "quality"]
    assert example["quality"] == "<high | medium | low>" and example["unreadable"] is False
