"""Decision trace API: background run, status for starters, stream and history for the admin role only."""

from __future__ import annotations

import json
import time

from fastapi.testclient import TestClient

from tests.adapters.test_evaluations_api import _project, _register_rate, app_client, model  # noqa: F401
from tests.conftest import cabecera

ADMIN = "coordinador"
MISSING = "00000000-0000-0000-0000-000000000000"  # a well-formed id of a project that does not exist


def _base(pid: str) -> str:
    return f"/api/v1/proyectos/{pid}/evaluations/runs"


def _start(client: TestClient, pid: str, role: str = ADMIN) -> str:
    r = client.post(_base(pid), headers=cabecera(client, rol=role))
    assert r.status_code == 202, r.text
    return r.json()["run_id"]


def _wait_done(client: TestClient, pid: str, run_id: str, role: str = ADMIN) -> dict:
    for _ in range(200):
        body = client.get(f"{_base(pid)}/{run_id}", headers=cabecera(client, rol=role)).json()
        if body["status"] != "running":
            return body
        time.sleep(0.05)
    raise AssertionError("run did not finish")


def test_run_executes_in_background_and_admin_reads_the_saved_trace(app_client):  # noqa: F811
    _register_rate(app_client)
    pid = _project(app_client)
    run_id = _start(app_client, pid)
    assert _wait_done(app_client, pid, run_id)["status"] == "completed"
    trace = app_client.get(f"{_base(pid)}/{run_id}/trace", headers=cabecera(app_client, rol=ADMIN)).json()
    types = [e["type"] for e in trace["events"]]
    assert types[-1] == "final_answer" and "decision" in types and "hypothesis" in types
    assert [e["seq"] for e in trace["events"]] == sorted(e["seq"] for e in trace["events"])
    # the evaluation itself was saved like with the synchronous route
    assert (
        app_client.get(f"/api/v1/proyectos/{pid}/evaluations", headers=cabecera(app_client, rol=ADMIN)).json()[
            "evaluated_count"
        ]
        == 3
    )


def test_stream_replays_events_as_sse_and_ends(app_client):  # noqa: F811
    _register_rate(app_client)
    pid = _project(app_client)
    run_id = _start(app_client, pid)
    _wait_done(app_client, pid, run_id)
    with app_client.stream("GET", f"{_base(pid)}/{run_id}/stream", headers=cabecera(app_client, rol=ADMIN)) as r:
        assert r.headers["content-type"].startswith("text/event-stream")
        text = "".join(r.iter_text())
    payloads = [json.loads(line[6:]) for line in text.splitlines() if line.startswith("data: ")]
    assert payloads[-1] == {"status": "completed", "error": ""}
    assert payloads[-2]["type"] == "final_answer"


def test_stream_resumes_after_last_event_id(app_client):  # noqa: F811
    _register_rate(app_client)
    pid = _project(app_client)
    run_id = _start(app_client, pid)
    _wait_done(app_client, pid, run_id)
    headers = cabecera(app_client, rol=ADMIN) | {"Last-Event-ID": "2"}
    with app_client.stream("GET", f"{_base(pid)}/{run_id}/stream", headers=headers) as r:
        text = "".join(r.iter_text())
    seqs = [int(line[4:]) for line in text.splitlines() if line.startswith("id: ")]
    assert seqs and min(seqs) == 3


def test_every_other_role_is_forbidden_from_trace_and_stream_but_can_follow_status(app_client):  # noqa: F811
    _register_rate(app_client)
    pid = _project(app_client)
    run_id = _start(app_client, pid)
    _wait_done(app_client, pid, run_id)
    for role in ("evaluador", "aprobador", "auditor", "cargador"):
        headers = cabecera(app_client, rol=role)
        assert app_client.get(f"{_base(pid)}/{run_id}/trace", headers=headers).status_code == 403
        assert app_client.get(f"{_base(pid)}/{run_id}/stream", headers=headers).status_code == 403
    assert app_client.get(f"{_base(pid)}/{run_id}", headers=cabecera(app_client, rol="cargador")).status_code == 200
    assert app_client.get(f"{_base(pid)}/{run_id}/trace").status_code == 401


def test_uploader_can_start_a_run_and_follow_it_without_seeing_the_trace(app_client):  # noqa: F811
    _register_rate(app_client)
    pid = _project(app_client)
    run_id = _start(app_client, pid, role="cargador")
    assert _wait_done(app_client, pid, run_id, role="cargador")["status"] == "completed"


def test_other_tenant_admin_gets_404(app_client):  # noqa: F811
    _register_rate(app_client)
    pid = _project(app_client)
    run_id = _start(app_client, pid)
    _wait_done(app_client, pid, run_id)
    other = cabecera(app_client, org="beta", rol=ADMIN)
    assert app_client.get(f"{_base(pid)}/{run_id}/trace", headers=other).status_code == 404


def test_failed_run_reports_a_message_and_a_final_event(app_client):  # noqa: F811
    run_id = _start(app_client, MISSING)
    body = _wait_done(app_client, MISSING, run_id)
    assert body["status"] == "failed" and body["error"]
    trace = app_client.get(f"{_base(MISSING)}/{run_id}/trace", headers=cabecera(app_client, rol=ADMIN))
    assert trace.json()["events"][-1]["type"] == "final_answer"


def test_saved_trace_never_contains_supplier_names_or_file_names(app_client):  # noqa: F811
    _register_rate(app_client)
    pid = _project(app_client)
    run_id = _start(app_client, pid)
    _wait_done(app_client, pid, run_id)
    raw = app_client.get(f"{_base(pid)}/{run_id}/trace", headers=cabecera(app_client, rol=ADMIN)).text
    for forbidden in ("Alfa", "Beta", "Gamma", "alfa.pdf", "beta.pdf", "SUPPLIER"):
        assert forbidden not in raw
