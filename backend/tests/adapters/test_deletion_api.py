"""Deleting files and projects removes everything derived from them and keeps the audit trail."""

from __future__ import annotations

from pathlib import Path

from evaluador.adapters.inbound.http.guards import LimitadorDeVentana
from tests.adapters.test_evaluations_api import _evaluate, _project, app_client, model  # noqa: F401 - fixtures
from tests.conftest import cabecera

TWO = {
    "alfa.pdf": "SUPPLIER=Alfa CURRENCY=USD instalacion garantia soporte equipos nuevos",
    "gamma.pdf": "SUPPLIER=Gamma CURRENCY=USD BADMATH instalacion garantia soporte",
}


def _files(client) -> list[Path]:
    return list(Path(client.app.state.contenedor.gestion._almacen._raiz).rglob("*.bin"))


def _evaluated(client, files=TWO) -> tuple[str, dict[str, str]]:
    project = _project(client, files)
    assert _evaluate(client, project).status_code == 201
    listed = client.get(f"/api/v1/proyectos/{project}/propuestas", headers=cabecera(client)).json()
    return project, {p["archivo"]: p["id"] for p in listed}


def _get(client, path, role="coordinador"):
    return client.get(f"/api/v1/proyectos/{path}", headers=cabecera(client, rol=role))


def _delete(client, path, role="coordinador", org="alfa"):
    return client.delete(f"/api/v1/proyectos/{path}", headers=cabecera(client, org, role))


def test_deleting_an_evaluated_file_removes_its_result_and_review(app_client):  # noqa: F811
    project, ids = _evaluated(app_client)
    review = {"proposal_id": ids["gamma.pdf"], "approved": False, "comment": ""}
    assert app_client.post(f"/api/v1/proyectos/{project}/reviews", json=review,
                           headers=cabecera(app_client, rol="evaluador")).status_code == 201  # fmt: skip
    assert _get(app_client, f"{project}/propuestas/{ids['gamma.pdf']}/markdown").status_code == 200
    assert _delete(app_client, f"{project}/propuestas/{ids['gamma.pdf']}").status_code == 204
    result = _get(app_client, f"{project}/evaluations").json()
    assert [i["filename"] for i in result["items"]] == ["alfa.pdf"] and result["ranking"] == [ids["alfa.pdf"]]
    assert not any("gamma.pdf" in w for w in result["warnings"])
    assert _get(app_client, f"{project}/reviews").json() == []
    assert len(_files(app_client)) == 1
    assert app_client.app.state.contenedor.proposal_markdown._cache == {}
    assert _get(app_client, project).json()["estado"] == "en_revision_del_comite"


def test_deleting_the_last_evaluated_file_reopens_the_project(app_client):  # noqa: F811
    project, ids = _evaluated(app_client)
    for proposal in ids.values():
        assert _delete(app_client, f"{project}/propuestas/{proposal}").status_code == 204
    assert _get(app_client, project).json()["estado"] == "en_recepcion"
    assert _get(app_client, f"{project}/evaluations").status_code == 404 and _files(app_client) == []


def test_deleting_a_project_erases_it_and_keeps_an_intact_audit_trail(app_client):  # noqa: F811
    project, _ = _evaluated(app_client)
    other = _project(app_client, {"otra.pdf": "SUPPLIER=Otra CURRENCY=USD instalacion"}, name="Otro")
    assert _delete(app_client, project).status_code == 204
    assert _get(app_client, project).status_code == 404
    assert _get(app_client, f"{project}/evaluations").status_code == 404
    assert [p["id"] for p in app_client.get("/api/v1/proyectos", headers=cabecera(app_client)).json()] == [other]
    assert len(_files(app_client)) == 1  # only the other project's file
    audit = app_client.get("/api/v1/auditoria", headers=cabecera(app_client, rol="auditor")).json()
    actions = [e["accion"] for e in audit["eventos"]]
    assert audit["integra"] and actions.count("propuesta_eliminada") == 2 and "proyecto_eliminado" in actions


def test_who_may_delete(app_client):  # noqa: F811
    app_client.app.state.limitador_login = LimitadorDeVentana(1000)  # many sign-ins in one test
    project, ids = _evaluated(app_client)
    for role in ("evaluador", "aprobador", "auditor"):
        assert _delete(app_client, project, role=role).status_code == 403
        assert _delete(app_client, f"{project}/propuestas/{ids['alfa.pdf']}", role=role).status_code == 403
    assert _delete(app_client, project, org="beta").status_code == 404
    assert _delete(app_client, f"{project}/propuestas/{ids['alfa.pdf']}", org="beta").status_code == 404
    assert app_client.delete(f"/api/v1/proyectos/{project}").status_code == 401
    assert len(_files(app_client)) == 2


def test_an_awarded_project_is_kept_even_after_closing(app_client):  # noqa: F811
    project, ids = _evaluated(app_client)
    approver = cabecera(app_client, rol="aprobador")
    for target in ("adjudicado", "cerrado"):
        moved = app_client.post(f"/api/v1/proyectos/{project}/transiciones", json={"destino": target},
                                headers=approver)  # fmt: skip
        assert moved.status_code == 200, moved.text
        assert _delete(app_client, project).status_code == 409
        assert _delete(app_client, f"{project}/propuestas/{ids['alfa.pdf']}").status_code == 409
    assert len(_files(app_client)) == 2
