"""The guided flow: evaluate some proposals, verify them with a yes or no, add more and re-evaluate."""
# ruff: noqa: F811 - pytest fixtures imported from the evaluation tests are used as parameters

from tests.adapters.test_evaluations_api import (  # noqa: F401 - pytest fixtures
    DEFAULT_FILES,
    _evaluate,
    _pdf,
    _project,
    _register_rate,
    app_client,
    model,
)
from tests.conftest import cabecera

FOUR = DEFAULT_FILES | {"delta.pdf": "SUPPLIER=Delta CURRENCY=USD instalacion garantia soporte equipos nuevos"}


def _ids(client, project_id):
    r = client.get(f"/api/v1/proyectos/{project_id}/propuestas", headers=cabecera(client, rol="cargador"))
    return {p["archivo"]: p["id"] for p in r.json()}


def _run(client, project_id, ids, role="coordinador"):
    url = f"/api/v1/proyectos/{project_id}/evaluations"
    return client.post(url, json={"proposal_ids": ids}, headers=cabecera(client, rol=role))


def _decide(client, project_id, proposal_id, approved, comment="", role="evaluador"):
    body = {"proposal_id": proposal_id, "approved": approved, "comment": comment}
    return client.post(f"/api/v1/proyectos/{project_id}/reviews", json=body, headers=cabecera(client, rol=role))


def _reviews(client, project_id):
    return client.get(f"/api/v1/proyectos/{project_id}/reviews", headers=cabecera(client, rol="evaluador")).json()


def test_first_run_reads_only_the_chosen_even_a_single_one(app_client):
    _register_rate(app_client)
    pid = _project(app_client, FOUR)
    r = _run(app_client, pid, [_ids(app_client, pid)["alfa.pdf"]])
    assert r.status_code == 201, r.text
    assert [i["filename"] for i in r.json()["items"]] == ["alfa.pdf"]


def test_a_whole_project_is_analysed_at_once_or_in_parts(app_client):
    _register_rate(app_client)
    files = {f"oferta{n}.pdf": f"SUPPLIER=Prov{n} CURRENCY=USD instalacion garantia soporte lote {n}" for n in range(7)}
    pid = _project(app_client, files)
    ids = list(_ids(app_client, pid).values())
    assert len(_run(app_client, pid, ids[:5]).json()["items"]) == 5
    assert len(_run(app_client, pid, ids[5:]).json()["items"]) == 7
    assert len(_evaluate(app_client, pid).json()["items"]) == 7


def test_a_later_selective_run_keeps_the_others_and_ranks_everything(app_client):
    _register_rate(app_client)
    pid = _project(app_client)
    assert _evaluate(app_client, pid).status_code == 201
    headers = cabecera(app_client, rol="cargador") | {"Content-Type": "application/octet-stream"}
    added = app_client.post(  # new offers are still accepted while the committee reviews
        f"/api/v1/proyectos/{pid}/propuestas?archivo=delta.pdf", content=_pdf(FOUR["delta.pdf"]), headers=headers
    )
    assert added.status_code == 201, added.text
    body = _run(app_client, pid, [added.json()["id"]]).json()
    assert sorted(i["filename"] for i in body["items"]) == ["alfa.pdf", "beta.pdf", "delta.pdf", "gamma.pdf"]
    assert body["items"][-1]["filename"] == "gamma.pdf"  # the discarded one stays last


def test_unknown_or_empty_selection_is_refused(app_client):
    pid = _project(app_client)
    assert _run(app_client, pid, []).status_code == 422
    assert _run(app_client, pid, ["00000000-0000-0000-0000-000000000000"]).status_code == 404


def test_verification_records_who_and_requires_a_reason_to_disagree(app_client):
    _register_rate(app_client)
    pid = _project(app_client)
    _evaluate(app_client, pid)
    ids = _ids(app_client, pid)
    assert _decide(app_client, pid, ids["alfa.pdf"], True).status_code == 201
    assert _decide(app_client, pid, ids["gamma.pdf"], True).status_code == 422
    r = _decide(app_client, pid, ids["gamma.pdf"], True, "La suma se corrigió con el proveedor.")
    assert r.status_code == 201 and r.json()["decided_by"] == "evaluador@alfa.test"
    assert sorted(d["approved"] for d in _reviews(app_client, pid)) == [True, True]
    audit = app_client.get("/api/v1/auditoria", headers=cabecera(app_client, rol="auditor")).json()
    assert "review_decision" in {e["accion"] for e in audit["eventos"]} and audit["integra"]


def test_reading_a_proposal_again_voids_its_verification_only(app_client):
    _register_rate(app_client)
    pid = _project(app_client)
    _evaluate(app_client, pid)
    ids = _ids(app_client, pid)
    _decide(app_client, pid, ids["alfa.pdf"], True)
    _decide(app_client, pid, ids["beta.pdf"], True)
    assert _run(app_client, pid, [ids["beta.pdf"]]).status_code == 201
    assert [d["proposal_id"] for d in _reviews(app_client, pid)] == [ids["alfa.pdf"]]


def test_only_review_roles_decide_and_other_tenants_see_nothing(app_client):
    _register_rate(app_client)
    pid = _project(app_client)
    _evaluate(app_client, pid)
    ids = _ids(app_client, pid)
    for role in ("cargador", "auditor"):
        assert _decide(app_client, pid, ids["alfa.pdf"], True, role=role).status_code == 403
    other = cabecera(app_client, org="beta", rol="coordinador")
    assert app_client.get(f"/api/v1/proyectos/{pid}/reviews", headers=other).status_code == 404


def test_coordinator_runs_the_flow_but_cannot_award(app_client):
    _register_rate(app_client)
    pid = _project(app_client)
    ids = _ids(app_client, pid)
    assert _run(app_client, pid, list(ids.values())).json()["restricted"] is False
    assert _decide(app_client, pid, ids["alfa.pdf"], True, role="coordinador").status_code == 201
    r = app_client.post(
        f"/api/v1/proyectos/{pid}/transiciones",
        json={"destino": "adjudicado", "motivo": None},
        headers=cabecera(app_client, rol="coordinador"),
    )
    assert r.status_code == 403
