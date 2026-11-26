from fastapi.testclient import TestClient

from evaluador.adapters.inbound.http.app import create_app
from evaluador.composition.container import build_container
from evaluador.composition.settings import Settings


def _client(**cfg):
    config = Settings(log_level="CRITICAL", **cfg)
    return TestClient(create_app(config, build_container()))


def test_extra_demo_account_logs_in_with_only_email_and_password():
    c = _client(demo_user_email="demo@demo.local", demo_user_password="Clave-Demo-1!")
    r = c.post("/api/v1/sessions", json={"email": "DEMO@demo.local", "password": "Clave-Demo-1!"})
    assert r.status_code == 201 and r.json()["user"]["role"] == "loader"
    assert c.post("/api/v1/sessions", json={"email": "demo@demo.local", "password": "other"}).status_code == 401


def test_in_production_no_seeding_without_explicit_permission():
    c = _client(environment="produccion", demo_user_email="demo@demo.local", demo_user_password="Clave-Demo-1!")
    assert c.post("/api/v1/sessions", json={"email": "demo@demo.local", "password": "Clave-Demo-1!"}).status_code == 401
