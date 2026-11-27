"""POST /api/v1/evaluations/{id}/chat: autenticación, permisos, aislamiento y forma de la respuesta."""

import dataclasses
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from evaluador.adapters.inbound.http.app import create_app
from evaluador.adapters.inbound.http.routers import chat
from evaluador.adapters.outbound.ai.fake_embedder import FakeEmbedder
from evaluador.adapters.outbound.ai.fake_model import FakeModel
from evaluador.application.use_cases.chat import AskEvaluationChat
from evaluador.composition.settings import Settings
from evaluador.domain.chat import ChatAnswer, ChatCitationDraft
from tests.conftest import header, login

JOB = "11111111-1111-1111-1111-111111111111"
TEXT = "La garantía es de tres años en sitio con soporte técnico telefónico de lunes a viernes."


class Sources:
    def __init__(self, tenant_id: str) -> None:
        self.tenant_id = tenant_id

    def list(self, tenant_id, job_id):
        return [("alfa", "alfa.pdf")] if (tenant_id, job_id) == (self.tenant_id, JOB) else None

    def text(self, tenant_id, proposal_id):
        return TEXT


class NullAudit:
    def register(self, **_):
        pass


def make_client(container, answer):
    alfa = container.tenants.by_code("alfa")
    sources = Sources(alfa.id)
    model = FakeModel({ChatAnswer: answer})
    ask = AskEvaluationChat(sources, sources, model, FakeEmbedder(), NullAudit())
    wired = SimpleNamespace(**{f.name: getattr(container, f.name) for f in dataclasses.fields(container)}, ask_chat=ask)
    app = create_app(Settings(log_level="CRITICAL"), wired)
    app.include_router(chat.router, prefix="/api/v1")
    return TestClient(app), model


GOOD = ChatAnswer(
    found=True,
    answer="Tres años en sitio.",
    citations=[ChatCitationDraft(proposal_id="alfa", quote="garantía es de tres años")],
)
URL = f"/api/v1/evaluations/{JOB}/chat"


@pytest.fixture
def api(container):
    return make_client(container, GOOD)[0]


def test_answer_with_verified_citation(api):
    r = api.post(URL, json={"question": "¿Qué garantía ofrece?"}, headers=header(api, role="evaluator"))
    assert r.status_code == 200
    body = r.json()
    assert body["found"] is True and body["answer"] == "Tres años en sitio."
    assert body["citations"] == [{"proposal_id": "alfa", "file": "alfa.pdf", "quote": "garantía es de tres años"}]


def test_not_found_has_fixed_answer_and_no_citations(container):
    nothing = ChatAnswer(found=False, answer="inventado")
    api, _ = make_client(container, nothing)
    r = api.post(URL, json={"question": "¿Precio del flete?"}, headers=header(api, role="auditor"))
    assert r.status_code == 200 and r.json() == {
        "found": False, "answer": "No consta en los documentos de esta evaluación.", "citations": [],
    }  # fmt: skip


def test_requires_authentication(api):
    assert api.post(URL, json={"question": "hola"}).status_code == 401


def test_loader_has_no_permission_to_see_results(api):
    r = api.post(URL, json={"question": "hola"}, headers=header(api, role="loader"))
    assert r.status_code == 403 and r.json()["code"] == "permission_denied"


def test_other_tenant_gets_404(api):
    r = api.post(URL, json={"question": "hola"}, headers=header(api, org="beta", role="evaluator"))
    assert r.status_code == 404


@pytest.mark.parametrize(
    "payload", [{}, {"question": ""}, {"question": "   "}, {"question": "x" * 501}, {"question": "ok", "tenant": "t"}]
)
def test_invalid_payload_is_422_without_echo(api, payload):
    r = api.post(URL, json=payload, headers=header(api, role="evaluator"))
    assert r.status_code == 422 and "x" * 20 not in r.text


def test_malformed_evaluation_id_is_422(api):
    r = api.post(
        "/api/v1/evaluations/no-es-un-id/chat", json={"question": "hola"}, headers=header(api, role="evaluator")
    )
    assert r.status_code == 422


def test_provider_failure_is_503_with_clear_message(container):
    def boom(_):
        raise RuntimeError("api-key-secreta timeout")

    api, _ = make_client(container, boom)
    r = api.post(URL, json={"question": "hola"}, headers=header(api, role="evaluator"))
    assert r.status_code == 503 and r.json()["code"] == "service_unavailable"
    assert "secreta" not in r.text and r.json()["track_id"]


def test_login_helper_still_works(api):  # el cableado de prueba no rompe las rutas existentes
    assert login(api).status_code == 201
