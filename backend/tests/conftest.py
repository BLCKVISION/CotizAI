import pytest
from fastapi.testclient import TestClient

from evaluador.adapters.inbound.http.aplicacion import crear_aplicacion
from evaluador.composition.configuracion import Configuracion
from evaluador.composition.contenedor import construir_contenedor
from evaluador.domain.identidad import Rol, Tenant, Usuario

CLAVE = "Clave-Segura-123!"


@pytest.fixture
def contenedor():
    c = construir_contenedor()
    h = c.hasheador.hashear(CLAVE)
    for codigo in ("alfa", "beta"):
        c.tenants.guardar(Tenant(id=f"t-{codigo}", codigo=codigo, nombre=codigo.upper()))
        for rol in Rol:
            c.usuarios.guardar(
                Usuario(
                    id=f"{codigo}-{rol}",
                    tenant_id=f"t-{codigo}",
                    correo=f"{rol}@{codigo}.test",
                    hash_contrasena=h,
                    rol=rol,
                )
            )
    return c


@pytest.fixture
def cliente(contenedor):
    return TestClient(crear_aplicacion(Configuracion(nivel_de_log="CRITICAL"), contenedor))


def login(cliente, org="alfa", rol="cargador", clave=CLAVE):
    """Login solo con correo y contraseña; `org` únicamente elige qué usuario de prueba usar."""
    return cliente.post("/api/v1/sesiones", json={"correo": f"{rol}@{org}.test", "contrasena": clave})


def cabecera(cliente, org="alfa", rol="cargador"):
    return {"Authorization": f"Bearer {login(cliente, org, rol).json()['token_acceso']}"}
