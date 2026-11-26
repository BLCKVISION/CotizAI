import pytest

from evaluador.adapters.inbound.http.guards import LimitadorDeVentana
from tests.conftest import CLAVE, cabecera, login


def test_cabeceras_de_seguridad_en_todas_las_respuestas(cliente):
    for r in (cliente.get("/api/v1/salud"), cliente.get("/api/v1/proyectos"), cliente.get("/no-existe")):
        assert r.headers["x-content-type-options"] == "nosniff"
        assert r.headers["x-frame-options"] == "DENY"
        assert r.headers["cache-control"] == "no-store"
        assert "default-src 'none'" in r.headers["content-security-policy"]


def test_track_id_valido_se_respeta_y_malicioso_se_reemplaza(cliente):
    assert cliente.get("/api/v1/salud", headers={"X-Track-Id": "abc-12345678"}).headers["x-track-id"] == "abc-12345678"
    r = cliente.get("/api/v1/salud", headers={"X-Track-Id": 'x"; DROP TABLE--'})
    assert r.headers["x-track-id"] != 'x"; DROP TABLE--' and len(r.headers["x-track-id"]) == 36


@pytest.mark.parametrize("auth", ["", "Basic abc", "Bearer", "Bearer    ", "Bearer token-falso", "bearer"])
def test_autenticacion_rechaza_cabeceras_invalidas(cliente, auth):
    r = cliente.get("/api/v1/proyectos", headers={"Authorization": auth} if auth else {})
    assert r.status_code == 401 and r.headers["www-authenticate"] == "Bearer"


def test_error_401_no_filtra_trazas_y_trae_track_id(cliente):
    j = cliente.get("/api/v1/proyectos").json()
    assert set(j) >= {"codigo", "mensaje", "track_id"} and "Traceback" not in str(j)


@pytest.mark.parametrize("pid", ["../../etc/passwd", "a b", "x" * 300, "';--"])
def test_id_de_proyecto_con_formato_invalido_no_llega_al_caso_de_uso(cliente, pid):
    r = cliente.get(f"/api/v1/proyectos/{pid}", headers=cabecera(cliente))
    assert r.status_code in (404, 422)


def test_cuerpo_demasiado_grande_no_provoca_500(cliente):
    r = cliente.post("/api/v1/sesiones", content=b'{"a":"' + b"x" * 5_000_000 + b'"}',
                     headers={"Content-Type": "application/json"})  # fmt: skip
    assert r.status_code < 500


def test_json_malformado_devuelve_422_sin_eco(cliente):
    r = cliente.post(
        "/api/v1/sesiones", content=b"{contrasena: Secreta-1", headers={"Content-Type": "application/json"}
    )
    assert r.status_code == 422 and "Secreta-1" not in r.text


def test_sql_injection_en_login_es_rechazado_como_credencial_invalida(cliente):
    r = cliente.post(
        "/api/v1/sesiones", json={"organizacion": "alfa' OR '1'='1", "correo": "a@b.co", "contrasena": CLAVE}
    )
    assert r.status_code in (401, 422)


def test_token_de_un_tenant_no_da_acceso_a_proyecto_de_otro(cliente):
    NUEVO = {"nombre": "Lab", "requerimiento": "x", "ubicacion": "y"}
    p = cliente.post("/api/v1/proyectos", json=NUEVO, headers=cabecera(cliente, "alfa")).json()
    r = cliente.post(f"/api/v1/proyectos/{p['id']}/transiciones", json={"destino": "cerrado", "motivo": "x"},
                     headers=cabecera(cliente, "beta", "aprobador"))  # fmt: skip
    assert r.status_code == 404


def test_login_exitoso_no_devuelve_hash_ni_contrasena(cliente):
    texto = login(cliente).text
    assert "argon2" not in texto and CLAVE not in texto and "hash" not in texto


def test_limitador_de_ventana():
    from fastapi import HTTPException

    lim = LimitadorDeVentana(2)
    lim.verificar("ip1"); lim.verificar("ip1"); lim.verificar("otra")  # fmt: skip
    with pytest.raises(HTTPException) as e:
        lim.verificar("ip1")
    assert e.value.status_code == 429 and e.value.headers["Retry-After"] == "60"
