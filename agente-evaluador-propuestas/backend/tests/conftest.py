import pytest
from fastapi.testclient import TestClient

from evaluador.adapters.inbound.http.app import create_app
from evaluador.composition.container import build_container
from evaluador.composition.settings import Settings
from evaluador.domain.identity import Role, Tenant, User

KEY = "Clave-Segura-123!"


@pytest.fixture
def container():
    c = build_container()
    h = c.hasher.hash(KEY)
    for code in ("alfa", "beta"):
        c.tenants.save(Tenant(id=f"t-{code}", code=code, name=code.upper()))
        for role in Role:
            c.users.save(
                User(
                    id=f"{code}-{role}",
                    tenant_id=f"t-{code}",
                    email=f"{role}@{code}.test",
                    password_hash=h,
                    role=role,
                )
            )
    return c


@pytest.fixture
def client(container):
    return TestClient(create_app(Settings(log_level="CRITICAL"), container))


def login(client, org="alfa", role="loader", key=KEY):
    """Login solo con correo y contraseña; `org` únicamente elige qué usuario de prueba usar."""
    return client.post("/api/v1/sessions", json={"email": f"{role}@{org}.test", "password": key})


def header(client, org="alfa", role="loader"):
    return {"Authorization": f"Bearer {login(client, org, role).json()['access_token']}"}
