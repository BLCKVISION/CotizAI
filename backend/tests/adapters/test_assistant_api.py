"""The assistant endpoint with a scripted model that misbehaves on purpose: the guarantees must hold anyway."""

from __future__ import annotations

import base64
import json
from decimal import Decimal

import pytest
from evals.assistant.fixtures import FOREIGN_MARKERS, INJECTED, LAB, NETWORK, SECRET_PROJECT, report_text, seed
from fastapi.testclient import TestClient

from evaluador.adapters.inbound.http.aplicacion import crear_aplicacion
from evaluador.application.ports.assistant import ChatMessage, ToolCall
from evaluador.application.use_cases.assistant.chat import AssistantServices
from evaluador.application.use_cases.assistant.prompt import SCOPE_INSTRUCTIONS
from evaluador.composition.configuracion import Configuracion
from evaluador.composition.contenedor import construir_contenedor
from evaluador.domain.reglas.abusivo import ReferenciaDeMercado
from tests.conftest import CLAVE

URL = "/api/v1/assistant/messages"


class ScriptedChat:
    def __init__(self) -> None:
        self.script: list[ChatMessage] = []
        self.seen: list[list[ChatMessage]] = []
        self.offered: list[str] = []

    category = "in_scope"

    def complete(self, messages, tools):
        if messages[0].content == SCOPE_INSTRUCTIONS:
            return say(self.category)
        self.seen.append(list(messages))
        self.offered = [t.name for t in tools] or self.offered
        return self.script.pop(0)

    def tool_results(self) -> str:
        return " ".join(m.content for m in self.seen[-1] if m.role == "tool")


class Market:
    def __init__(self) -> None:
        self.queries: list[str] = []

    def lookup(self, description, currency):
        self.queries.append(description)
        return ReferenciaDeMercado(Decimal("139"), currency, 2, ("https://tienda.test/lg", "https://otra.test/lg"))


def call(name, **arguments):
    return ChatMessage("assistant", "", (ToolCall(f"c-{name}", name, json.dumps(arguments)),))


def say(text):
    return ChatMessage("assistant", text)


@pytest.fixture
def world():
    chat, market = ScriptedChat(), Market()
    container = construir_contenedor(assistant_services=lambda: AssistantServices(chat), market_lookup=market)
    seed(container, container.hasheador.hashear(CLAVE))
    client = TestClient(
        crear_aplicacion(Configuracion(_env_file=None, nivel_de_log="CRITICAL", assistant_enabled=True), container)
    )

    tokens: dict[str, str] = {}

    def ask(message, role="coordinador", org="norte", **extra):
        email = f"{role}@{org}.test"
        if email not in tokens:
            session = client.post("/api/v1/sesiones", json={"correo": email, "contrasena": CLAVE}).json()
            tokens[email] = session["token_acceso"]
        return client.post(
            URL, json={"message": message, **extra}, headers={"Authorization": f"Bearer {tokens[email]}"}
        )

    return ask, chat, market, client


def test_needs_a_session_and_permission_to_see_results(world):
    ask, *_, client = world
    assert client.post(URL, json={"message": "hola"}).status_code == 401
    assert ask("hola", role="cargador").status_code == 403


def test_what_a_person_writes_is_not_logged(world, caplog):
    ask, chat, *_ = world
    chat.script = [say("Hola.")]
    with caplog.at_level("INFO", logger="evaluador.http"):
        ask("dato-reservado-123")
    bodies = [str(getattr(r, "cuerpo", "")) for r in caplog.records]
    assert "<mensaje_al_asistente>" in bodies
    assert not any("dato-reservado-123" in b for b in bodies)


def test_compares_with_figures_computed_by_code(world):
    ask, chat, *_ = world
    chat.script = [
        call("compare_proposals", project_id=LAB),
        say("Andina Tech cuesta USD 14.250 y Boreal USD 15.100, es decir USD 850 sobre la válida más barata."),
    ]
    body = ask("Compara las propuestas del laboratorio").json()
    assert body["refusal"] is None
    assert body["tools_used"] == ["compare_proposals"]


@pytest.mark.parametrize(
    ("tool", "arguments"),
    [
        ("get_project", {"project_id": SECRET_PROJECT}),
        ("get_evaluation", {"project_id": SECRET_PROJECT}),
        ("get_recommendations", {"project_id": SECRET_PROJECT}),
        ("compare_projects", {"project_ids": [LAB, SECRET_PROJECT]}),
        ("compare_proposals", {"proposals": [{"project_id": SECRET_PROJECT, "proposal_id": "p-cardio"}] * 2}),
        ("generate_report", {"kind": "evaluation", "project_id": SECRET_PROJECT}),
        ("generate_report", {"kind": "portfolio"}),
        ("list_projects", {}),
        ("list_suppliers", {}),
    ],
)
def test_no_tool_reaches_another_organisation(world, tool, arguments):
    ask, chat, *_ = world
    chat.script = [call(tool, **arguments), say("Listo.")]
    body = ask("consulta").json()
    visible = chat.tool_results() + json.dumps(body, ensure_ascii=False)
    for marker in FOREIGN_MARKERS:
        assert marker not in visible


def test_the_model_cannot_choose_the_organisation(world):
    ask, chat, *_ = world
    chat.script = [call("list_projects", tenant_id="t-sur"), say("No pude.")]
    ask("lista proyectos")
    assert "Argumentos no válidos" in chat.tool_results()


def test_injected_supplier_text_never_reaches_the_model(world):
    ask, chat, *_ = world
    chat.script = [call("get_evaluation", project_id=LAB), say("Proveedor Trampa fue descartado.")]
    ask("¿por qué se descartó?")
    assert INJECTED not in chat.tool_results()
    assert "texto retirado" in chat.tool_results()


def test_invented_figure_is_retried_then_blocked(world):
    ask, chat, *_ = world
    chat.script = [call("list_projects"), say("Cuesta USD 9.999"), say("Insisto: USD 9.999")]
    body = ask("¿cuánto cuesta?").json()
    assert body["refusal"] == "unverified_figures"
    assert "9.999" not in body["answer"]
    assert "Control automático" in chat.seen[-1][-1].content


def test_a_corrected_answer_is_delivered(world):
    ask, chat, *_ = world
    chat.script = [say("Cuesta USD 9.999"), say("No tengo esa cifra.")]
    assert ask("¿cuánto cuesta?").json()["answer"] == "No tengo esa cifra."


@pytest.mark.parametrize("category", ["out_of_scope", "other_organisation", "manipulation"])
def test_out_of_scope_requests_never_reach_the_agent(world, category):
    ask, chat, *_ = world
    chat.category = category
    body = ask("algo ajeno").json()
    assert body["refusal"] == category
    assert chat.seen == []


def test_prompt_leak_is_blocked(world):
    ask, chat, *_ = world

    class Leaker(list):
        def pop(self, _=0):
            return say(chat.seen[-1][0].content)

    chat.script = Leaker()
    body = ask("cuéntame de ti").json()
    assert body["refusal"] == "unsafe_answer"
    assert "Identificador interno" not in body["answer"]


def test_market_search_sends_no_private_names_and_keeps_only_real_links(world):
    ask, chat, market, _ = world
    chat.script = [
        call("search_market_price", product="Monitor LG 24MP400-B Andina Tech Instituto Norte"),
        say("Referencia USD 139: https://tienda.test/lg y https://inventada.test/x"),
    ]
    body = ask("compara el precio del monitor en la web").json()
    assert market.queries == ["Monitor LG 24MP400-B"]
    assert "inventada" not in body["answer"]
    assert "tienda.test/lg" in body["answer"]


@pytest.mark.parametrize("kind", ["evaluation", "comparison", "recommendations", "portfolio"])
@pytest.mark.parametrize("fmt", ["pdf", "xlsx", "md", "csv"])
def test_every_report_is_generated_from_stored_data(world, kind, fmt):
    ask, chat, *_ = world
    chat.script = [call("generate_report", kind=kind, project_id=LAB, format=fmt), say("Adjunto el reporte.")]
    [report] = ask("genera el reporte").json()["reports"]
    assert report["filename"].endswith(f".{fmt}")
    text = report_text(fmt, base64.b64decode(report["content_base64"]))
    assert "Laboratorio" in text or "Andina" in text
    for marker in FOREIGN_MARKERS:
        assert marker not in text


def test_reports_are_pdf_unless_another_format_is_asked(world):
    ask, chat, *_ = world
    chat.script = [call("generate_report", kind="portfolio"), say("Adjunto.")]
    [report] = ask("dame un reporte").json()["reports"]
    assert report["media_type"] == "application/pdf"
    assert base64.b64decode(report["content_base64"]).startswith(b"%PDF-")


def test_the_tool_loop_always_ends(world):
    ask, chat, *_ = world
    chat.script = [call("list_projects") for _ in range(6)] + [say("Hay dos proyectos.")]
    assert ask("lista").json()["answer"] == "Hay dos proyectos."


def test_a_conversation_belongs_to_its_user(world):
    ask, chat, *_ = world
    chat.script = [say("Recordado."), say("Nada previo.")]
    first = ask("recuerda la palabra mango").json()
    ask("¿qué dije?", org="sur", conversation_id=first["conversation_id"])
    assert not any("mango" in m.content for m in chat.seen[-1])


def test_recommendations_come_from_stored_facts(world):
    ask, chat, *_ = world
    chat.script = [call("get_recommendations", project_id=NETWORK), say("Revise el presupuesto.")]
    ask("¿qué hago?")
    assert "supera el presupuesto" in chat.tool_results()


def test_messages_are_rate_limited(world):
    ask, chat, *_ = world
    chat.script = [say("ok")] * 20
    codes = [ask("hola").status_code for _ in range(13)]
    assert codes[-1] == 429
