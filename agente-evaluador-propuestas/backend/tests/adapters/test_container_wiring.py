"""El Container real expone y cablea los casos de uso que ya piden los routers (antes solo se probaban con dobles)."""

import io

import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook

from evaluador.adapters.inbound.http.app import create_app
from evaluador.composition.container import build_container
from evaluador.composition.settings import Settings
from evaluador.domain.identity import Role, Tenant, User
from tests.conftest import KEY, header

NEEDED = [
    "upload_proposal", "list_proposals", "delete_proposal", "start_evaluation", "get_evaluation_result",
    "list_job_events", "list_reviews", "add_review", "list_suppliers", "supplier_records",
    "check_supplier_history", "list_audit", "verify_audit", "export_report", "ask_chat",
]  # fmt: skip


def seed(container):
    h = container.hasher.hash(KEY)
    for code in ("alfa", "beta"):
        container.tenants.save(Tenant(id=f"t-{code}", code=code, name=code.upper()))
        for role in Role:
            container.users.save(
                User(
                    id=f"{code}-{role}", tenant_id=f"t-{code}", email=f"{role}@{code}.test", password_hash=h, role=role
                )
            )
    return container


@pytest.fixture
def app_client():
    return TestClient(create_app(Settings(log_level="CRITICAL"), seed(build_container())))


def xlsx(rows: int = 1) -> bytes:
    wb = Workbook()
    for i in range(rows):
        wb.active.append([f"Monitor {i}", 11, 100])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def new_project(client, org="alfa") -> str:
    body = {"name": "Laboratorio", "requirement": "Dotar laboratorio", "location": "Caracas"}
    return client.post("/api/v1/projects", json=body, headers=header(client, org)).json()["id"]


def upload(client, project, name="alfa.xlsx", data=None, org="alfa"):
    files = {"file": (name, data if data is not None else xlsx(), "application/octet-stream")}
    return client.post(f"/api/v1/projects/{project}/proposals", files=files, headers=header(client, org))


def test_the_container_exposes_every_use_case_the_routers_need():
    c = build_container()
    assert [n for n in NEEDED if not hasattr(c, n)] == []


def test_upload_list_and_delete_a_proposal_through_the_real_app(app_client):
    project = new_project(app_client)
    r = upload(app_client, project)
    assert r.status_code == 201, r.text
    listed = app_client.get(f"/api/v1/projects/{project}/proposals", headers=header(app_client)).json()
    assert [p["filename"] for p in listed] == ["alfa.xlsx"]
    gone = app_client.delete(f"/api/v1/projects/{project}/proposals/{r.json()['id']}", headers=header(app_client))
    assert gone.status_code == 204


def test_an_upload_over_one_mib_is_not_cut_by_the_json_limit(app_client):
    big = xlsx(rows=1) + b"\x00" * (2 * 1024 * 1024)  # relleno tras el zip: sigue siendo un XLSX por su firma
    assert upload(app_client, new_project(app_client), data=big).status_code == 201


def test_every_action_lands_in_a_verifiable_audit_chain(app_client):
    project = new_project(app_client)
    upload(app_client, project)
    auditor = header(app_client, role="auditor")
    verdict = app_client.get("/api/v1/audit/verification", headers=auditor).json()
    assert verdict["intact"] is True and verdict["entries"] >= 1
    entries = app_client.get("/api/v1/audit", headers=auditor).json()
    assert any(e["action"] == "proposal_uploaded" for e in entries)


def test_suppliers_start_empty_and_an_unknown_evaluation_is_404(app_client):
    h = header(app_client, role="evaluator")
    assert app_client.get("/api/v1/suppliers", headers=h).json() == []
    unknown = "11111111-1111-1111-1111-111111111111"
    assert app_client.get(f"/api/v1/evaluations/{unknown}/reviews", headers=h).status_code == 404
    assert app_client.get(f"/api/v1/evaluations/{unknown}/alerts", headers=h).status_code == 404
    assert app_client.get(f"/api/v1/evaluations/{unknown}", headers=h).status_code == 404


def test_chat_without_a_language_model_is_service_unavailable(app_client):
    unknown = "11111111-1111-1111-1111-111111111111"
    r = app_client.post(
        f"/api/v1/evaluations/{unknown}/chat",
        json={"question": "¿Garantía?"},
        headers=header(app_client, role="evaluator"),
    )
    assert r.status_code == 503 and r.json()["code"] == "service_unavailable"


def test_data_survives_a_new_container_with_sql_persistence(tmp_path):
    url = f"sqlite:///{tmp_path / 'e.db'}"
    config = Settings(log_level="CRITICAL", persistence="sql", database_url=url)
    first = TestClient(create_app(config, seed(build_container(config=config))))
    project = new_project(first)
    assert upload(first, project).status_code == 201
    second = TestClient(create_app(config, build_container(config=config)))  # contenedor nuevo, misma base
    names = [p["filename"] for p in second.get(f"/api/v1/projects/{project}/proposals", headers=header(second)).json()]
    assert names == ["alfa.xlsx"]
