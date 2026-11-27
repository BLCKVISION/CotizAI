"""Endpoints /audit: solo el rol auditor; el resto recibe 403. FastAPI mínima con el contenedor simulado."""

from dataclasses import replace
from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from evaluador.adapters.inbound.http.http_errors import register_handlers
from evaluador.adapters.inbound.http.routers import audit as audit_router
from evaluador.adapters.outbound.memory.audit_trail import ChainedAudit, InMemoryAuditTrail
from evaluador.application.use_cases.audit import ListAudit, VerifyAudit
from evaluador.application.use_cases.authentication import AuthenticatedSession
from evaluador.domain.errors import InvalidSession
from evaluador.domain.identity import Role, User


class Clock:
    def now(self) -> datetime:
        return datetime(2026, 1, 1, tzinfo=UTC)


class FakeAuth:
    """token = «rol:tenant»."""

    def execute(self, token: str) -> AuthenticatedSession:
        try:
            role, tenant = token.split(":")
            u = User(id=f"u-{role}", tenant_id=tenant, email="a@b.c", password_hash="x", role=Role(role))
        except ValueError:
            raise InvalidSession("Sesión inválida o expirada.") from None
        return AuthenticatedSession(session_id="s1", user=u)


@pytest.fixture
def env():
    trail = InMemoryAuditTrail()
    audit = ChainedAudit(trail, Clock())
    for i in range(5):
        audit.register(tenant_id="t1", actor="u1", action=f"a{i}", detail=f"id-{i}")
    audit.register(tenant_id="t2", actor="u9", action="otro_tenant", detail="x")
    app = FastAPI()
    app.state.container = SimpleNamespace(
        authenticate_token=FakeAuth(), list_audit=ListAudit(trail), verify_audit=VerifyAudit(trail)
    )
    app.include_router(audit_router.router, prefix="/api/v1")
    register_handlers(app)
    return TestClient(app), trail


def h(role: str, tenant: str = "t1") -> dict[str, str]:
    return {"Authorization": f"Bearer {role}:{tenant}"}


def test_auditor_lists_entries_of_its_tenant_only(env):
    client, _ = env
    r = client.get("/api/v1/audit", headers=h("auditor"))
    assert r.status_code == 200
    body = r.json()
    assert [e["seq"] for e in body] == [1, 2, 3, 4, 5] and "otro_tenant" not in {e["action"] for e in body}
    assert set(body[0]) == {"seq", "at", "actor", "action", "detail", "prev_hash", "hash"}


def test_pagination_with_after_and_limit(env):
    client, _ = env
    r = client.get("/api/v1/audit?after=2&limit=2", headers=h("auditor"))
    assert [e["seq"] for e in r.json()] == [3, 4]


@pytest.mark.parametrize("query", ["after=-1", "limit=0", "limit=201", "limit=abc"])
def test_invalid_query_is_422(env, query):
    client, _ = env
    assert client.get(f"/api/v1/audit?{query}", headers=h("auditor")).status_code == 422


@pytest.mark.parametrize("role", ["loader", "evaluator", "approver"])
def test_other_roles_get_403(env, role):
    client, _ = env
    assert client.get("/api/v1/audit", headers=h(role)).status_code == 403
    assert client.get("/api/v1/audit/verification", headers=h(role)).status_code == 403


def test_without_token_is_401(env):
    client, _ = env
    assert client.get("/api/v1/audit").status_code == 401


def test_verification_intact_then_tampered(env):
    client, trail = env
    ok = client.get("/api/v1/audit/verification", headers=h("auditor")).json()
    assert ok == {"intact": True, "first_invalid_seq": None, "entries": 5}
    trail._entries["t1"][3] = replace(trail._entries["t1"][3], action="borrado_de_huellas")
    bad = client.get("/api/v1/audit/verification", headers=h("auditor")).json()
    assert bad == {"intact": False, "first_invalid_seq": 4, "entries": 5}
