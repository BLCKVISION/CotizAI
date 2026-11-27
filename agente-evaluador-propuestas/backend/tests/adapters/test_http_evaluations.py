from types import SimpleNamespace

import pytest
from fastapi import APIRouter, FastAPI
from fastapi.testclient import TestClient

from evaluador.adapters.inbound.http.guards import WindowLimiter
from evaluador.adapters.inbound.http.http_errors import register_handlers
from evaluador.adapters.inbound.http.routers import evaluations, sessions
from evaluador.domain.project import ProjectState
from tests.application.test_evaluation_flow import Env
from tests.conftest import header

PROJECT_ID = "11111111-1111-1111-1111-111111111111"


@pytest.fixture
def env():
    return Env(tenant="t-alfa", project_id=PROJECT_ID)


@pytest.fixture
def api(container, env):
    """Auth real (contenedor con usuarios de prueba) + los casos de uso del flujo sobre el entorno en memoria."""
    app = FastAPI()
    app.state.container = SimpleNamespace(
        start_session=container.start_session,
        authenticate_token=container.authenticate_token,
        close_session=container.close_session,
        start_evaluation=env.start,
        get_evaluation_result=env.get,
        list_job_events=env.list_events,
    )
    app.state.login_limiter = WindowLimiter(1000)
    app.state.production = False
    router = APIRouter(prefix="/api/v1")
    router.include_router(sessions.router)
    router.include_router(evaluations.router)
    app.include_router(router)
    register_handlers(app)
    return TestClient(app)


def start(api, role="evaluator", org="alfa"):
    return api.post(f"/api/v1/projects/{PROJECT_ID}/evaluations", headers=header(api, org, role))


def test_start_returns_202_with_the_evaluation_id_and_queues_the_project(api, env):
    r = start(api)
    assert r.status_code == 202
    body = r.json()
    assert body["status"] == "queued" and len(body["id"]) == 36
    assert env.state() is ProjectState.EVALUATING


def test_start_is_idempotent_and_loader_can_start(api):
    first = start(api).json()["id"]
    assert start(api, role="loader").json()["id"] == first


def test_start_requires_permission_and_a_valid_project_id(api):
    assert start(api, role="auditor").status_code == 403
    assert (
        api.post("/api/v1/projects/no-es-uuid/evaluations", headers=header(api, "alfa", "evaluator")).status_code == 422
    )
    assert api.post(f"/api/v1/projects/{PROJECT_ID}/evaluations").status_code == 401


def test_start_in_another_tenant_is_404(api):
    assert start(api, org="beta").status_code == 404


def test_get_result_queued_then_done(api, env):
    eid = start(api).json()["id"]
    h = header(api, "alfa", "evaluator")
    queued = api.get(f"/api/v1/evaluations/{eid}", headers=h).json()
    assert queued["status"] == "queued" and queued["ranking"] == [] and queued["proposals"] == []
    env.run.execute()
    done = api.get(f"/api/v1/evaluations/{eid}", headers=h).json()
    assert done["status"] == "done" and done["project_id"] == PROJECT_ID
    assert done["ranking"] == ["Propuesta_A", "Propuesta_B", "Propuesta_C"] and done["delta"] == "3"
    first = done["proposals"][0]
    assert first["verdict"] == "valid" and first["cost"]["steps"] and first["criteria"]["performance"]["score"] == 95


def test_result_permissions_and_tenant(api, env):
    eid = start(api).json()["id"]
    env.run.execute()
    assert api.get(f"/api/v1/evaluations/{eid}", headers=header(api, "alfa", "auditor")).status_code == 200
    assert api.get(f"/api/v1/evaluations/{eid}", headers=header(api, "alfa", "loader")).status_code == 403
    assert api.get(f"/api/v1/evaluations/{eid}", headers=header(api, "beta", "evaluator")).status_code == 404
    assert api.get(f"/api/v1/evaluations/{eid}").status_code == 401
    assert api.get("/api/v1/evaluations/xyz", headers=header(api, "alfa", "evaluator")).status_code == 422


def test_events_are_listed_after_a_sequence(api, env):
    eid = start(api).json()["id"]
    env.run.execute()
    h = header(api, "alfa", "evaluator")
    events = api.get(f"/api/v1/evaluations/{eid}/events", headers=h).json()
    assert [e["seq"] for e in events] == list(range(1, len(events) + 1))
    assert set(events[0]) == {"seq", "at", "kind", "message"} and events[0]["kind"] == "info"
    later = api.get(f"/api/v1/evaluations/{eid}/events?after=2", headers=h).json()
    assert [e["seq"] for e in later] == [e["seq"] for e in events[2:]]
    assert api.get(f"/api/v1/evaluations/{eid}/events?after=-1", headers=h).status_code == 422
    assert api.get(f"/api/v1/evaluations/{eid}/events", headers=header(api, "beta", "evaluator")).status_code == 404
