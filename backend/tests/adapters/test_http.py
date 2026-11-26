import json
import logging

from tests.conftest import CLAVE, cabecera, login

NUEVO = {"nombre": "Laboratorio 11 PCs", "requerimiento": "Dotar laboratorio", "ubicacion": "Caracas"}


def test_login_correcto_devuelve_token_y_track_id(cliente):
    r = login(cliente)
    assert r.status_code == 201
    assert r.json()["usuario"]["rol"] == "cargador"
    assert r.headers["x-track-id"]


def test_login_errores_son_indistinguibles(cliente):
    casos = [
        login(cliente, clave="mala"),
        login(cliente, rol="inexistente"),
        cliente.post("/api/v1/sesiones", json={"correo": "nadie@otro.test", "contrasena": CLAVE}),
    ]
    assert {c.status_code for c in casos} == {401}
    assert len({c.json()["mensaje"] for c in casos}) == 1


def test_bloqueo_tras_intentos_fallidos(cliente):
    for _ in range(5):
        login(cliente, clave="mala")
    assert login(cliente).status_code == 401  # ya bloqueado, aun con la clave correcta


def test_payload_con_campos_extra_o_invalidos_se_rechaza_sin_eco(cliente):
    r = cliente.post("/api/v1/sesiones", json={"correo": "x", "contrasena": "Secreta-9", "rol": "admin"})
    assert r.status_code == 422
    assert "Secreta-9" not in r.text


def test_sin_token_401_y_rol_sin_permiso_403(cliente):
    assert cliente.get("/api/v1/proyectos").status_code == 401
    r = cliente.post("/api/v1/proyectos", json=NUEVO, headers=cabecera(cliente, rol="auditor"))
    assert r.status_code == 403


def test_aislamiento_entre_tenants(cliente):
    creado = cliente.post("/api/v1/proyectos", json=NUEVO, headers=cabecera(cliente, "alfa")).json()
    otro = cabecera(cliente, "beta", "evaluador")
    assert cliente.get("/api/v1/proyectos", headers=otro).json() == []
    assert cliente.get(f"/api/v1/proyectos/{creado['id']}", headers=otro).status_code == 404


def test_cerrar_sesion_invalida_el_token(cliente):
    h = cabecera(cliente)
    assert cliente.delete("/api/v1/sesiones/actual", headers=h).status_code == 204
    assert cliente.get("/api/v1/usuarios/actual", headers=h).status_code == 401


def test_flujo_de_estados_y_permisos(cliente):
    p = cliente.post("/api/v1/proyectos", json=NUEVO, headers=cabecera(cliente)).json()
    url = f"/api/v1/proyectos/{p['id']}/transiciones"
    assert cliente.post(url, json={"destino": "cerrado", "motivo": "x"}, headers=cabecera(cliente)).status_code == 403
    assert (
        cliente.post(url, json={"destino": "adjudicado"}, headers=cabecera(cliente, rol="aprobador")).status_code == 409
    )


def test_logs_traen_contexto_y_censuran_el_payload(cliente, caplog):
    caplog.set_level(logging.INFO)
    cliente.post("/api/v1/sesiones", json={"correo": "cargador@alfa.test", "contrasena": CLAVE})
    texto = "\n".join(r.getMessage() + json.dumps(getattr(r, "cuerpo", "")) for r in caplog.records)
    assert CLAVE not in texto
    assert "c***@alfa.test" in texto
    ev = next(r for r in caplog.records if r.getMessage() == "http_solicitud")
    assert ev.cuerpo["contrasena"] == "***" and ev.estado == 201


def test_login_sin_organizacion_y_tenant_deducido_del_correo(cliente):
    a = login(cliente, "alfa").json()["usuario"]
    b = login(cliente, "beta").json()["usuario"]
    assert a["organizacion_id"] == "t-alfa" and b["organizacion_id"] == "t-beta"


def test_login_rechaza_el_campo_organizacion(cliente):
    r = cliente.post(
        "/api/v1/sesiones", json={"organizacion": "alfa", "correo": "cargador@alfa.test", "contrasena": CLAVE}
    )
    assert r.status_code == 422


def test_correo_duplicado_entre_tenants_no_se_permite(contenedor):
    import dataclasses

    import pytest

    u = contenedor.usuarios.por_correo("cargador@alfa.test")
    with pytest.raises(ValueError):
        contenedor.usuarios.guardar(dataclasses.replace(u, id="otro-id", tenant_id="t-beta"))
