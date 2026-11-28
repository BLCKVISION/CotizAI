from datetime import UTC, datetime

import pytest

from evaluador.domain.identidad import PERMISOS_POR_ROL, Permiso, Rol
from evaluador.domain.trace_events import (
    MAX_SUMMARY,
    EventType,
    StepStatus,
    TraceEvent,
    sanitize_metadata,
    sanitize_text,
)

NOW = datetime(2026, 11, 28, tzinfo=UTC)


def test_only_the_coordinator_may_view_the_decision_trace():
    holders = {role for role, grants in PERMISOS_POR_ROL.items() if Permiso.VIEW_DECISION_TRACE in grants}
    assert holders == {Rol.COORDINADOR}


def test_sanitize_text_redacts_bearer_tokens_and_long_secrets():
    text = "Authorization: Bearer abc.def.ghi y sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAA fin"
    out = sanitize_text(text)
    assert "abc.def.ghi" not in out
    assert "AAAAAAAAAAAAAAAA" not in out


def test_sanitize_text_strips_invisible_characters_and_collapses_whitespace():
    assert sanitize_text("a​b \n\n  c") == "ab c"


def test_sanitize_text_truncates():
    assert len(sanitize_text("x " * 5000, limit=MAX_SUMMARY)) <= MAX_SUMMARY


def test_metadata_keeps_only_allow_listed_keys():
    out = sanitize_metadata({"tool": "market_search", "latency_ms": 12, "password": "hunter2", "prompt": "system..."})
    assert out == {"tool": "market_search", "latency_ms": 12}


def test_metadata_args_redact_sensitive_keys_and_nested_values():
    out = sanitize_metadata({"args": {"query": "monitor 24", "api_key": "k", "nested": {"a": 1}}})
    assert out["args"] == {"query": "monitor 24", "api_key": "[censurado]", "nested": "[omitido]"}


def test_metadata_rejects_unknown_status():
    with pytest.raises(ValueError):
        sanitize_metadata({"status": "weird"})


def test_event_is_immutable_and_serialises_to_wire_format():
    event = TraceEvent(
        id="e1", run_id="r1", tenant_id="t1", seq=1, timestamp=NOW, type=EventType.TOOL_CALL,
        title="Consultar precios", summary="Se consulta la web.", metadata={"status": StepStatus.RUNNING.value},
    )  # fmt: skip
    assert event.to_wire() == {
        "id": "e1", "runId": "r1", "seq": 1, "timestamp": "2026-11-28T00:00:00+00:00", "type": "tool_call",
        "title": "Consultar precios", "summary": "Se consulta la web.", "metadata": {"status": "running"},
    }  # fmt: skip
    assert "tenant_id" not in event.to_wire()
    with pytest.raises(AttributeError):
        event.seq = 2  # type: ignore[misc]


@pytest.mark.parametrize(
    "secret",
    ["juan.perez@proveedor.com", "J-12345678-9", "J123456789", "0412-555 1234", "4111 1111 1111 1111"],
)
def test_sanitize_text_masks_personal_and_fiscal_data(secret):
    assert secret not in sanitize_text(f"Contacto {secret} fin")


def test_internal_proposal_id_is_kept_but_other_values_are_dropped():
    uid = "123e4567-e89b-12d3-a456-426614174000"
    assert sanitize_metadata({"proposal_id": uid}) == {"proposal_id": uid}
    assert sanitize_metadata({"proposal_id": "juan@x.com"}) == {}
