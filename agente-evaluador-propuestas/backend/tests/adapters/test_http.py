import json
import logging

from tests.conftest import KEY, header, login

NEW = {"name": "Laboratorio 11 PCs", "requirement": "Dotar laboratorio", "location": "Caracas"}


def test_successful_login_returns_token_and_track_id(client):
    r = login(client)
    assert r.status_code == 201
    assert r.json()["user"]["role"] == "loader"
    assert r.headers["x-track-id"]


def test_login_errors_are_indistinguishable(client):
    cases = [
        login(client, key="mala"),
        login(client, role="nonexistent"),
        client.post("/api/v1/sessions", json={"email": "nadie@otro.test", "password": KEY}),
    ]
    assert {c.status_code for c in cases} == {401}
    assert len({c.json()["message"] for c in cases}) == 1


def test_lockout_after_failed_attempts(client):
    for _ in range(5):
        login(client, key="mala")
    assert login(client).status_code == 401  # ya bloqueado, aun con la clave correcta


def test_payload_with_extra_or_invalid_fields_is_rejected_without_echo(client):
    r = client.post("/api/v1/sessions", json={"email": "x", "password": "Secreta-9", "role": "admin"})
    assert r.status_code == 422
    assert "Secreta-9" not in r.text


def test_no_token_401_and_role_without_permission_403(client):
    assert client.get("/api/v1/projects").status_code == 401
    r = client.post("/api/v1/projects", json=NEW, headers=header(client, role="auditor"))
    assert r.status_code == 403


def test_isolation_between_tenants(client):
    created = client.post("/api/v1/projects", json=NEW, headers=header(client, "alfa")).json()
    other = header(client, "beta", "evaluator")
    assert client.get("/api/v1/projects", headers=other).json() == []
    assert client.get(f"/api/v1/projects/{created['id']}", headers=other).status_code == 404


def test_close_session_invalidates_the_token(client):
    h = header(client)
    assert client.delete("/api/v1/sessions/current", headers=h).status_code == 204
    assert client.get("/api/v1/users/current", headers=h).status_code == 401


def test_state_flow_and_permissions(client):
    p = client.post("/api/v1/projects", json=NEW, headers=header(client)).json()
    url = f"/api/v1/projects/{p['id']}/transitions"
    assert client.post(url, json={"target": "closed", "reason": "x"}, headers=header(client)).status_code == 403
    assert client.post(url, json={"target": "awarded"}, headers=header(client, role="approver")).status_code == 409


def test_logs_carry_context_and_redact_the_payload(client, caplog):
    caplog.set_level(logging.INFO)
    client.post("/api/v1/sessions", json={"email": "loader@alfa.test", "password": KEY})
    text = "\n".join(r.getMessage() + json.dumps(getattr(r, "body", "")) for r in caplog.records)
    assert KEY not in text
    assert "l***@alfa.test" in text
    ev = next(r for r in caplog.records if r.getMessage() == "http_request")
    assert ev.body["password"] == "***" and ev.status == 201


def test_login_without_organization_and_tenant_derived_from_email(client):
    a = login(client, "alfa").json()["user"]
    b = login(client, "beta").json()["user"]
    assert a["organization_id"] == "t-alfa" and b["organization_id"] == "t-beta"


def test_login_rejects_the_organization_field(client):
    r = client.post("/api/v1/sessions", json={"organization": "alfa", "email": "loader@alfa.test", "password": KEY})
    assert r.status_code == 422


def test_duplicate_email_across_tenants_is_not_allowed(container):
    import dataclasses

    import pytest

    u = container.users.by_email("loader@alfa.test")
    with pytest.raises(ValueError):
        container.users.save(dataclasses.replace(u, id="otro-id", tenant_id="t-beta"))
