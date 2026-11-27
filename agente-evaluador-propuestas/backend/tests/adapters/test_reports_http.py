from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from evaluador.adapters.inbound.http.app import create_app
from evaluador.adapters.inbound.http.routers import reports
from evaluador.adapters.outbound.reports import RENDERERS
from evaluador.application.use_cases.export_report import ExportReport
from evaluador.composition.container import build_container
from evaluador.composition.settings import Settings
from evaluador.domain.identity import Role, Tenant, User
from tests.adapters._report_fixtures import full_result

KEY = "Clave-Segura-123!"
EID = "11111111-1111-1111-1111-111111111111"


class Source:
    def get(self, tenant_id, job_id):
        return full_result() if (tenant_id, job_id) == ("t-alfa", EID) else None


class Names:
    def name_of(self, tenant_id, project_id):
        return "Laboratorio 11 PCs ñ"


@pytest.fixture
def client():
    real = build_container()
    h = real.hasher.hash(KEY)
    for code in ("alfa", "beta"):
        real.tenants.save(Tenant(id=f"t-{code}", code=code, name=code))
        for role in Role:
            real.users.save(User(id=f"{code}-{role}", tenant_id=f"t-{code}", email=f"{role}@{code}.test",
                                 password_hash=h, role=role))  # fmt: skip
    audit = []

    class A:
        def register(self, *, tenant_id, actor, action, detail=""):
            audit.append(action)

    container = SimpleNamespace(
        start_session=real.start_session,
        authenticate_token=real.authenticate_token,
        close_session=real.close_session,
        export_report=ExportReport(Source(), Names(), RENDERERS, A()),
    )
    app = create_app(Settings(log_level="CRITICAL"), container)  # type: ignore[arg-type]
    app.include_router(reports.router, prefix="/api/v1")
    c = TestClient(app)
    c.audit = audit  # type: ignore[attr-defined]
    return c


def auth(client, org="alfa", role="evaluator"):
    r = client.post("/api/v1/sessions", json={"email": f"{role}@{org}.test", "password": KEY})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.mark.parametrize(
    ("fmt", "media", "magic"),
    [("pdf", "application/pdf", b"%PDF"), ("md", "text/markdown", b"#"), ("csv", "text/csv", b"\xef\xbb\xbf"),
     ("xlsx", "spreadsheetml", b"PK")],
)  # fmt: skip
def test_downloads_each_format_with_safe_headers(client, fmt, media, magic):
    r = client.get(f"/api/v1/evaluations/{EID}/export", params={"format": fmt}, headers=auth(client))
    assert r.status_code == 200 and media in r.headers["content-type"] and r.content.startswith(magic)
    assert r.headers["x-content-type-options"] == "nosniff"
    cd = r.headers["content-disposition"]
    assert cd.startswith("attachment;") and cd.isascii() and f".{fmt}" in cd and "/" not in cd.split("filename=")[1]
    assert "report_exported" in client.audit


def test_requires_authentication_and_permission(client):
    assert client.get(f"/api/v1/evaluations/{EID}/export?format=pdf").status_code == 401
    r = client.get(f"/api/v1/evaluations/{EID}/export?format=pdf", headers=auth(client, role="loader"))
    assert r.status_code == 403


def test_invalid_format_is_422_and_other_tenant_or_unknown_is_404(client):
    assert client.get(f"/api/v1/evaluations/{EID}/export?format=docx", headers=auth(client)).status_code == 422
    assert client.get(f"/api/v1/evaluations/{EID}/export", headers=auth(client)).status_code == 422
    assert (
        client.get(f"/api/v1/evaluations/{EID}/export?format=pdf", headers=auth(client, org="beta")).status_code == 404
    )
    other = "33333333-3333-3333-3333-333333333333"
    assert client.get(f"/api/v1/evaluations/{other}/export?format=pdf", headers=auth(client)).status_code == 404


def test_malformed_evaluation_id_is_rejected(client):
    r = client.get("/api/v1/evaluations/..%2Fetc/export?format=pdf", headers=auth(client))
    assert r.status_code in (404, 422)
