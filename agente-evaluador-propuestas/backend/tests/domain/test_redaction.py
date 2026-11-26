from evaluador.observability.redaction import redact, redact_headers


def test_redaction_nested_sensitive_fields_and_emails():
    r = redact({"contrasena": "x", "datos": {"token": "t", "correo": "ana@org.com", "ok": 1}, "n": [{"password": "p"}]})
    assert r == {
        "contrasena": "***",
        "datos": {"token": "***", "correo": "a***@org.com", "ok": 1},
        "n": [{"password": "***"}],
    }


def test_redaction_bearer_in_text_and_headers():
    assert "abc123" not in redact("fallo con Bearer abc123 en la llamada")
    assert redact_headers({"authorization": "Bearer zzz", "user-agent": "x"})["authorization"] == "***"
