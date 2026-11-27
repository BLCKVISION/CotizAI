"""Earlier runs are kept with their reports, and suppliers remember why they were discarded."""

from __future__ import annotations

from evaluador.adapters.inbound.http.guards import LimitadorDeVentana
from evaluador.domain.supplier_history import supplier_key
from tests.adapters.test_deletion_api import TWO, _delete, _evaluated
from tests.adapters.test_evaluations_api import _evaluate, app_client, model  # noqa: F401 - fixtures
from tests.conftest import cabecera


def _get(client, path, role="coordinador", org="alfa"):
    return client.get(f"/api/v1/{path}", headers=cabecera(client, org, role))


def test_supplier_key_ignores_accents_case_and_legal_suffixes():
    assert supplier_key("Distribuidora Ávila, C.A.") == supplier_key("DISTRIBUIDORA AVILA")


def test_every_run_is_kept_and_its_report_can_be_downloaded(app_client):  # noqa: F811
    project, ids = _evaluated(app_client)
    assert _evaluate(app_client, project).status_code == 201
    runs = _get(app_client, f"proyectos/{project}/evaluation-runs").json()
    assert len(runs) == 2 and {r["proposals"] for r in runs} == {2}
    assert runs[0]["recommended"] == "alfa.pdf" and runs[0]["evaluated_by"] == "evaluador@alfa.test"
    report = _get(app_client, f"proyectos/{project}/evaluation-runs/{runs[1]['id']}/report")
    assert report.status_code == 200 and "alfa.pdf" in report.text
    # Removing a file edits the current result; the earlier runs stay as they were.
    assert _delete(app_client, f"{project}/propuestas/{ids['gamma.pdf']}").status_code == 204
    assert [r["proposals"] for r in _get(app_client, f"proyectos/{project}/evaluation-runs").json()] == [2, 2]


def test_a_discarded_supplier_carries_an_alert(app_client):  # noqa: F811
    project, _ = _evaluated(app_client)
    body = _get(app_client, "suppliers/history").json()
    records = {r["name"]: r for r in body["suppliers"]}
    assert body["restricted"] is False and set(records) == {"Alfa", "Gamma"}
    assert records["Alfa"]["alerts"] == [] and records["Alfa"]["participations"][0]["position"] == 1
    assert records["Gamma"]["registration"] is None
    assert records["Gamma"]["alerts"] == [{"code": "ARITMETICA", "times": 1}]
    assert records["Gamma"]["participations"][0]["causes"][0]["code"] == "ARITMETICA"
    created = {"nombre": "GAMMA, C.A.", "rif": "J-12345678-9", "ubicacion": "Caracas", "contacto": "0212-5550000"}
    assert app_client.post("/api/v1/proveedores", json=created, headers=cabecera(app_client)).status_code == 201
    after = _get(app_client, "suppliers/history").json()["suppliers"]
    gamma = next(r for r in after if r["key"] == "gamma")
    assert gamma["registration"]["tax_id"] == "J-12345678-9" and len(gamma["participations"]) == 1
    assert len(after) == 2  # the record and the quotes are one supplier


def test_history_respects_roles_organisations_and_deletion(app_client):  # noqa: F811
    app_client.app.state.limitador_login = LimitadorDeVentana(1000)
    project, _ = _evaluated(app_client, TWO)
    uploader = _get(app_client, "suppliers/history", role="cargador").json()
    assert uploader == {"restricted": True, "suppliers": []}
    assert _get(app_client, f"proyectos/{project}/evaluation-runs", role="cargador").status_code == 403
    assert _get(app_client, f"proyectos/{project}/evaluation-runs", org="beta").status_code == 404
    assert _get(app_client, "suppliers/history", org="beta").json()["suppliers"] == []
    assert _delete(app_client, project).status_code == 204
    assert _get(app_client, "suppliers/history").json()["suppliers"] == []
    assert app_client.app.state.contenedor.evaluation_history._evaluations.runs_of("t-alfa", project) == []
