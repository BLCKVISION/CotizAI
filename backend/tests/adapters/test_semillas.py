from fastapi.testclient import TestClient

from evaluador.adapters.inbound.http.aplicacion import crear_aplicacion
from evaluador.composition.configuracion import Configuracion
from evaluador.composition.contenedor import construir_contenedor


def _cliente(**cfg):
    config = Configuracion(nivel_de_log="CRITICAL", **cfg)
    return TestClient(crear_aplicacion(config, construir_contenedor()))


def test_cuenta_demo_extra_inicia_sesion_solo_con_correo_y_clave():
    c = _cliente(usuario_demo_correo="demo@demo.local", usuario_demo_clave="Clave-Demo-1!")
    r = c.post("/api/v1/sesiones", json={"correo": "DEMO@demo.local", "contrasena": "Clave-Demo-1!"})
    assert r.status_code == 201 and r.json()["usuario"]["rol"] == "cargador"
    assert c.post("/api/v1/sesiones", json={"correo": "demo@demo.local", "contrasena": "otra"}).status_code == 401


def test_en_produccion_no_se_siembra_sin_permiso_explicito():
    c = _cliente(entorno="produccion", usuario_demo_correo="demo@demo.local", usuario_demo_clave="Clave-Demo-1!")
    assert (
        c.post("/api/v1/sesiones", json={"correo": "demo@demo.local", "contrasena": "Clave-Demo-1!"}).status_code == 401
    )
