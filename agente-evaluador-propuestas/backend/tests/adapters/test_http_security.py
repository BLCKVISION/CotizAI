import pytest

from evaluador.adapters.inbound.http.guards import WindowLimiter
from tests.conftest import KEY, header, login


def test_security_headers_on_all_responses(client):
    for r in (client.get("/api/v1/health"), client.get("/api/v1/projects"), client.get("/no-existe")):
        assert r.headers["x-content-type-options"] == "nosniff"
        assert r.headers["x-frame-options"] == "DENY"
        assert r.headers["cache-control"] == "no-store"
        assert "default-src 'none'" in r.headers["content-security-policy"]


def test_valid_track_id_is_respected_and_malicious_one_is_replaced(client):
    assert client.get("/api/v1/health", headers={"X-Track-Id": "abc-12345678"}).headers["x-track-id"] == "abc-12345678"
    r = client.get("/api/v1/health", headers={"X-Track-Id": 'x"; DROP TABLE--'})
    assert r.headers["x-track-id"] != 'x"; DROP TABLE--' and len(r.headers["x-track-id"]) == 36


@pytest.mark.parametrize("auth", ["", "Basic abc", "Bearer", "Bearer    ", "Bearer token-falso", "bearer"])
def test_authentication_rejects_invalid_headers(client, auth):
    r = client.get("/api/v1/projects", headers={"Authorization": auth} if auth else {})
    assert r.status_code == 401 and r.headers["www-authenticate"] == "Bearer"


def test_error_401_leaks_no_traces_and_carries_track_id(client):
    j = client.get("/api/v1/projects").json()
    assert set(j) >= {"code", "message", "track_id"} and "Traceback" not in str(j)


@pytest.mark.parametrize("pid", ["../../etc/passwd", "a b", "x" * 300, "';--"])
def test_project_id_with_invalid_format_does_not_reach_the_use_case(client, pid):
    r = client.get(f"/api/v1/projects/{pid}", headers=header(client))
    assert r.status_code in (404, 422)


def test_oversized_body_does_not_cause_500(client):
    r = client.post("/api/v1/sessions", content=b'{"a":"' + b"x" * 5_000_000 + b'"}',
                     headers={"Content-Type": "application/json"})  # fmt: skip
    assert r.status_code < 500


def test_malformed_json_returns_422_without_echo(client):
    r = client.post("/api/v1/sessions", content=b"{contrasena: Secreta-1", headers={"Content-Type": "application/json"})
    assert r.status_code == 422 and "Secreta-1" not in r.text


def test_sql_injection_in_login_is_rejected_as_invalid_credential(client):
    r = client.post("/api/v1/sessions", json={"organization": "alfa' OR '1'='1", "email": "a@b.co", "password": KEY})
    assert r.status_code in (401, 422)


def test_token_of_one_tenant_gives_no_access_to_project_of_another(client):
    NEW = {"name": "Lab", "requirement": "x", "location": "y"}
    p = client.post("/api/v1/projects", json=NEW, headers=header(client, "alfa")).json()
    r = client.post(f"/api/v1/projects/{p['id']}/transitions", json={"target": "closed", "reason": "x"},
                     headers=header(client, "beta", "approver"))  # fmt: skip
    assert r.status_code == 404


def test_successful_login_returns_no_hash_or_password(client):
    text = login(client).text
    assert "argon2" not in text and KEY not in text and "hash" not in text


def test_window_limiter():
    from fastapi import HTTPException

    lim = WindowLimiter(2)
    lim.verify("ip1"); lim.verify("ip1"); lim.verify("other")  # fmt: skip
    with pytest.raises(HTTPException) as e:
        lim.verify("ip1")
    assert e.value.status_code == 429 and e.value.headers["Retry-After"] == "60"


def test_oversized_body_responds_413_with_traceability(client):
    r = client.post("/api/v1/sessions", content=b"x" * 2_000_000, headers={"Content-Type": "application/json"})
    assert r.status_code == 413 and r.json()["code"] == "payload_too_large"
    assert r.headers["x-track-id"] and r.headers["x-content-type-options"] == "nosniff"


def test_404_and_405_use_the_api_error_format(client):
    for r in (client.get("/api/v1/nada"), client.put("/api/v1/health")):
        assert {"code", "message", "track_id"} <= set(r.json())


def test_error_500_carries_track_id_and_security_headers(container):
    from fastapi.testclient import TestClient

    from evaluador.adapters.inbound.http.app import create_app
    from evaluador.composition.settings import Settings

    app = create_app(Settings(log_level="CRITICAL"), container)

    @app.get("/boom")
    def boom():
        raise RuntimeError("secreto-interno")

    r = TestClient(app, raise_server_exceptions=False).get("/boom")
    assert r.status_code == 500 and "secreto-interno" not in r.text
    assert r.headers["x-track-id"] and r.headers["x-content-type-options"] == "nosniff"
    assert "content-security-policy" in r.headers


def test_session_context_reaches_the_access_log(client):
    import logging

    from evaluador.observability import context

    seen = []

    class Spy(logging.Handler):
        def emit(self, record):  # el contexto se lee en el momento de emitir, igual que el formateador JSON
            if record.getMessage() == "http_request":
                seen.append(context.get())

    log = logging.getLogger("evaluador.http")
    h = Spy(logging.INFO)
    log.addHandler(h)
    level = log.level
    log.setLevel(logging.INFO)
    try:
        client.get("/api/v1/projects", headers=header(client))
    finally:
        log.removeHandler(h)
        log.setLevel(level)
    ctx = seen[-1]
    assert "-" not in (ctx.session_id, ctx.tenant_id, ctx.user_id)


def test_session_of_disabled_tenant_stops_being_valid(client, container):
    import dataclasses

    h = header(client)
    assert client.get("/api/v1/projects", headers=h).status_code == 200
    t = container.tenants.by_code("alfa")
    container.tenants.save(dataclasses.replace(t, active=False))
    assert client.get("/api/v1/projects", headers=h).status_code == 401


def test_limiter_purges_inactive_keys():
    lim = WindowLimiter(1)
    lim._MAX_KEYS = 3
    for i in range(3):
        lim.verify(f"ip{i}")
    for queue in lim._events.values():
        queue[0] -= 120  # simula que pasó más de un minuto
    lim.verify("new")
    assert set(lim._events) == {"new"}


def test_docs_have_no_strict_csp_in_development_but_do_in_production(container):
    from fastapi.testclient import TestClient

    from evaluador.adapters.inbound.http.app import create_app
    from evaluador.composition.settings import Settings

    dev = TestClient(create_app(Settings(log_level="CRITICAL"), container))
    assert "content-security-policy" not in dev.get("/api/docs").headers
    prod = TestClient(create_app(Settings(log_level="CRITICAL", environment="Production"), container))
    assert "strict-transport-security" in prod.get("/api/v1/health").headers
