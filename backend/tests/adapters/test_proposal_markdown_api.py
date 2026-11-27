"""The extracted text is the content of the file: same access rules as downloading it."""

from __future__ import annotations

from tests.adapters.test_evaluations_api import _project, app_client, model  # noqa: F401 - fixtures
from tests.conftest import cabecera


def test_markdown_of_a_stored_proposal_and_who_may_read_it(app_client, monkeypatch):  # noqa: F811
    project = _project(app_client, {"alfa.pdf": "SUPPLIER=Alfa CURRENCY=USD instalacion"})
    proposals = app_client.get(f"/api/v1/proyectos/{project}/propuestas", headers=cabecera(app_client)).json()
    url = f"/api/v1/proyectos/{project}/propuestas/{proposals[0]['id']}/markdown"
    ok = app_client.get(url, headers=cabecera(app_client, rol="cargador"))
    assert ok.status_code == 200, ok.text
    assert ok.json()["engine"] == "pdfplumber (PDF)" and "SUPPLIER=Alfa" in ok.json()["markdown"]
    assert app_client.get(url).status_code == 401
    assert app_client.get(url, headers=cabecera(app_client, org="beta", rol="cargador")).status_code == 404
    audit = app_client.get("/api/v1/auditoria", headers=cabecera(app_client, rol="auditor")).json()
    assert "propuesta_descargada" in [e["accion"] for e in audit["eventos"]]
    # A second reading comes from memory (no new OCR or AI call), still after checking who asks.
    use_case = app_client.app.state.contenedor.proposal_markdown
    monkeypatch.setattr(use_case, "_extract", lambda *a: (_ for _ in ()).throw(AssertionError("extracted twice")))
    assert app_client.get(url, headers=cabecera(app_client, rol="cargador")).json() == ok.json()
    assert app_client.get(url, headers=cabecera(app_client, org="beta", rol="cargador")).status_code == 404
