from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from evaluador.adapters.inbound.http.aplicacion import crear_aplicacion
from evaluador.composition.configuracion import Configuracion
from evaluador.composition.contenedor import construir_contenedor

URL = "/api/v1/registrations"
PASSWORD = "Clave-Muy-Segura-9"
ACCOUNT = {"display_name": "Ana Pérez", "email": "ana@universidad.test", "password": PASSWORD}


def _client(**settings) -> TestClient:
    config = Configuracion(_env_file=None, nivel_de_log="CRITICAL", **settings)
    return TestClient(crear_aplicacion(config, construir_contenedor(config=config)))


def _login(client, email=ACCOUNT["email"], password=PASSWORD):
    return client.post("/api/v1/sesiones", json={"correo": email, "contrasena": password})


def test_a_new_account_can_sign_in_and_work_alone():
    client = _client()
    assert client.post(URL, json=ACCOUNT).status_code == 204
    session = _login(client).json()
    assert session["usuario"]["rol"] == "coordinador"
    headers = {"Authorization": f"Bearer {session['token_acceso']}"}
    assert client.get("/api/v1/proyectos", headers=headers).json() == []


def test_each_account_has_its_own_organisation():
    client = _client()
    client.post(URL, json=ACCOUNT)
    client.post(URL, json={**ACCOUNT, "email": "luis@universidad.test"})
    first, second = _login(client).json(), _login(client, "luis@universidad.test").json()
    assert first["usuario"]["organizacion_id"] != second["usuario"]["organizacion_id"]


def test_an_existing_address_gets_the_same_answer_and_keeps_its_password():
    client = _client()
    client.post(URL, json=ACCOUNT)
    again = client.post(URL, json={**ACCOUNT, "email": "ANA@universidad.test", "password": "Otra-Clave-Segura-7"})
    assert (again.status_code, again.content) == (204, b"")
    assert _login(client).status_code == 201
    assert _login(client, password="Otra-Clave-Segura-7").status_code == 401


@pytest.mark.parametrize(
    "password", ["corta-A1!", "sinmayusculas-123", "SinNumero-abcde", "SinSimbolo12345", "Ana-universidad-1"]
)
def test_weak_passwords_are_refused_and_never_echoed(password):
    response = _client().post(URL, json={**ACCOUNT, "password": password})
    assert response.status_code == 422
    assert password not in response.text


def test_a_role_cannot_be_chosen():
    assert _client().post(URL, json={**ACCOUNT, "rol": "aprobador"}).status_code == 422


def test_sign_up_can_be_closed_capped_and_is_rate_limited():
    assert _client(registration_enabled=False).post(URL, json=ACCOUNT).status_code == 403
    capped = _client(registration_max_accounts=1)
    assert capped.post(URL, json=ACCOUNT).status_code == 204
    assert capped.post(URL, json={**ACCOUNT, "email": "otro@universidad.test"}).status_code == 403
    limited = _client()
    codes = [limited.post(URL, json={**ACCOUNT, "email": f"p{n}@universidad.test"}).status_code for n in range(4)]
    assert codes == [204, 204, 204, 429]


def test_the_unvalidated_assistant_is_off_by_default():
    assert _client().post("/api/v1/assistant/messages", json={"message": "hola"}).status_code == 404
