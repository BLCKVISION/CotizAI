import itertools
from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from fastapi import APIRouter, FastAPI
from fastapi.testclient import TestClient

from evaluador.adapters.inbound.http.http_errors import register_handlers
from evaluador.adapters.inbound.http.routers import proposals as router_module
from evaluador.adapters.outbound.memory.file_store import InMemoryFileStore
from evaluador.adapters.outbound.memory.proposals import InMemoryProposals
from evaluador.adapters.outbound.memory.repositories import InMemoryProjects
from evaluador.application.use_cases.authentication import AuthenticatedSession
from evaluador.application.use_cases.ingestion import DeleteProposal, ListProposals, UploadProposal
from evaluador.domain.errors import InvalidSession
from evaluador.domain.identity import Role, User
from evaluador.domain.project import Project

PID = "11111111-1111-1111-1111-111111111111"
PDF = b"%PDF-1.4\n" + b"contenido\n" * 10
SYSTEM_ATTRS = {"id", "filename", "sha256", "size_bytes", "created"}


class Ids:
    def __init__(self):
        self._c = itertools.count(1)

    def new(self):
        return f"00000000-0000-0000-0000-{next(self._c):012d}"


class Clock:
    def now(self):
        return datetime(2026, 1, 1, tzinfo=UTC)


class Audit:
    def register(self, **_):
        pass


class FakeAuth:
    def __init__(self):
        self.users = {
            "tok-loader": User("u1", "t1", "l@x.test", "h", Role.LOADER),
            "tok-loader-b": User("u2", "t2", "b@x.test", "h", Role.LOADER),
            "tok-eval": User("u3", "t1", "e@x.test", "h", Role.EVALUATOR),
            "tok-auditor": User("u4", "t1", "a@x.test", "h", Role.AUDITOR),
        }

    def execute(self, token):
        if token not in self.users:
            raise InvalidSession("Sesión inválida o expirada.")
        return AuthenticatedSession(session_id="s", user=self.users[token])


@pytest.fixture
def client():
    projects, proposals, files = InMemoryProjects(), InMemoryProposals(), InMemoryFileStore()
    projects.save(
        Project.create(
            id=PID,
            tenant_id="t1",
            name="Lab",
            requirement="r",
            location="l",
            reference_budget=None,
            created_by="u1",
            now=Clock().now(),
        )
    )
    ids, clock, audit = Ids(), Clock(), Audit()
    app = FastAPI()
    app.state.container = SimpleNamespace(
        authenticate_token=FakeAuth(),
        upload_proposal=UploadProposal(projects, proposals, files, ids, clock, audit),
        list_proposals=ListProposals(projects, proposals),
        delete_proposal=DeleteProposal(projects, proposals, files, audit),
    )
    api = APIRouter(prefix="/api/v1")
    api.include_router(router_module.router)
    app.include_router(api)
    register_handlers(app)
    c = TestClient(app)
    c.files_store = files
    return c


def auth(token="tok-loader"):  # noqa: S107
    return {"Authorization": f"Bearer {token}"}


def upload(client, name="Propuesta_A.pdf", data=PDF, token="tok-loader", project=PID, content_type="application/pdf"):  # noqa: S107
    return client.post(
        f"/api/v1/projects/{project}/proposals", files={"file": (name, data, content_type)}, headers=auth(token)
    )


def test_upload_returns_201_without_internal_fields(client):
    r = upload(client)
    assert r.status_code == 201
    body = r.json()
    assert set(body) == SYSTEM_ATTRS and body["filename"] == "Propuesta_A.pdf" and body["size_bytes"] == len(PDF)
    assert "storage_key" not in r.text and "path" not in r.text.lower().replace("pdf", "")


def test_upload_larger_than_default_multipart_spool_works(client):
    big = PDF + b"x" * (3 * 1024 * 1024)
    assert upload(client, "Grande.pdf", big).status_code == 201


def test_requires_authentication(client):
    r = client.post(f"/api/v1/projects/{PID}/proposals", files={"file": ("a.pdf", PDF, "application/pdf")})
    assert r.status_code == 401 and r.json()["code"] == "invalid_session"


@pytest.mark.parametrize("token", ["tok-eval", "tok-auditor"])
def test_roles_without_permission_get_403(client, token):
    assert upload(client, token=token).status_code == 403


def test_other_tenant_gets_404(client):
    assert upload(client, token="tok-loader-b").status_code == 404
    assert client.get(f"/api/v1/projects/{PID}/proposals", headers=auth("tok-loader-b")).status_code == 404


def test_json_body_is_rejected(client):
    r = client.post(f"/api/v1/projects/{PID}/proposals", json={"file": "x"}, headers=auth())
    assert r.status_code == 422 and r.json()["code"] == "invalid_data"


def test_missing_file_field_is_rejected(client):
    r = client.post(
        f"/api/v1/projects/{PID}/proposals", data={"otro": "x"}, files={"otro": ("a.pdf", PDF)}, headers=auth()
    )
    assert r.status_code == 422


def test_content_type_mismatch_is_rejected(client):
    assert upload(client, "falso.pdf", b"MZ\x90\x00").status_code == 422


def test_invalid_project_id_pattern(client):
    assert upload(client, project="no-es-uuid").status_code == 422


def test_duplicate_name_is_rejected_with_spanish_message(client):
    upload(client)
    r = upload(client, "propuesta_a.xlsx", b"PK\x03\x04" + b"x" * 30)
    assert r.status_code == 422 and "nombre" in r.json()["message"].lower()


def test_declared_oversize_is_413_without_reading_the_body(client, monkeypatch):
    monkeypatch.setattr(router_module, "MAX_REQUEST_BYTES", 5_000)
    r = upload(client, data=PDF + b"x" * 20_000)
    assert r.status_code == 413 and r.json()["code"] == "payload_too_large"


def test_streamed_oversize_without_content_length_is_413(client, monkeypatch):
    monkeypatch.setattr(router_module, "MAX_REQUEST_BYTES", 5_000)

    def chunks():
        yield b'--b\r\nContent-Disposition: form-data; name="file"; filename="a.pdf"\r\n\r\n'
        for _ in range(10):
            yield b"x" * 2_000
        yield b"\r\n--b--\r\n"

    r = client.post(
        f"/api/v1/projects/{PID}/proposals",
        content=chunks(),
        headers={**auth(), "Content-Type": "multipart/form-data; boundary=b"},
    )
    assert r.status_code == 413


def test_list_and_delete(client):
    pid = upload(client).json()["id"]
    r = client.get(f"/api/v1/projects/{PID}/proposals", headers=auth("tok-auditor"))
    assert r.status_code == 200 and [p["id"] for p in r.json()] == [pid]
    assert set(r.json()[0]) == SYSTEM_ATTRS
    assert client.delete(f"/api/v1/projects/{PID}/proposals/{pid}", headers=auth("tok-auditor")).status_code == 403
    assert client.delete(f"/api/v1/projects/{PID}/proposals/{pid}", headers=auth()).status_code == 204
    assert client.get(f"/api/v1/projects/{PID}/proposals", headers=auth()).json() == []


def test_delete_unknown_is_404(client):
    unknown = "22222222-2222-2222-2222-222222222222"
    assert client.delete(f"/api/v1/projects/{PID}/proposals/{unknown}", headers=auth()).status_code == 404


def test_unauthenticated_body_is_not_parsed(client, monkeypatch):
    """La autenticación va antes de leer el cuerpo: un anónimo no obliga a parsear 25 MiB."""
    called = []
    monkeypatch.setattr(router_module, "MultiPartParser", lambda *a, **k: called.append(1))
    r = client.post(f"/api/v1/projects/{PID}/proposals", files={"file": ("a.pdf", PDF, "application/pdf")})
    assert r.status_code == 401 and not called
