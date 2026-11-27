"""Transiciones de estado (P-4): una transición no permitida se rechaza y cada acción exige el rol correcto."""

import pytest

from tests.conftest import header

NEW = {"name": "Laboratorio 11 PCs", "requirement": "Dotar laboratorio", "location": "Caracas"}


def _h(client, org="alfa", role="loader"):
    """Login una sola vez por (org, rol) y prueba: Argon2 es deliberadamente lento."""
    cache = client.__dict__.setdefault("_cached_logins", {})
    return cache.setdefault((org, role), header(client, org, role))


def _owner(target):
    """Rol con permiso para ese destino: adjudicar y cerrar son del aprobador; el resto, de quien evalúa."""
    return "approver" if target in ("awarded", "closed") else "evaluator"


def _create(client, org="alfa"):
    return client.post("/api/v1/projects", json=NEW, headers=_h(client, org)).json()["id"]


def _go(client, pid, target, role, reason=None, org="alfa"):
    body = {"target": target} | ({"reason": reason} if reason is not None else {})
    return client.post(f"/api/v1/projects/{pid}/transitions", json=body, headers=_h(client, org, role))


def _to_review(client):
    pid = _create(client)
    assert _go(client, pid, "evaluating", "loader").status_code == 200
    assert _go(client, pid, "committee_review", "evaluator").status_code == 200
    return pid


def test_happy_path_up_to_award_and_close(client):
    pid = _to_review(client)
    r = _go(client, pid, "awarded", "approver")
    assert r.status_code == 200 and r.json()["state"] == "awarded"
    r = _go(client, pid, "closed", "approver")  # tras adjudicar no hace falta motivo
    assert r.status_code == 200 and r.json()["state"] == "closed"


@pytest.mark.parametrize("role", ["loader", "evaluator", "auditor"])
def test_only_the_approver_can_award(client, role):
    pid = _to_review(client)
    assert _go(client, pid, "awarded", role).status_code == 403
    assert client.get(f"/api/v1/projects/{pid}", headers=_h(client)).json()["state"] == "committee_review"


@pytest.mark.parametrize("role", ["loader", "evaluator", "auditor"])
def test_only_the_approver_can_close(client, role):
    pid = _create(client)
    assert _go(client, pid, "closed", role, "sin presupuesto").status_code == 403


def test_auditor_cannot_start_an_evaluation(client):
    assert _go(client, _create(client), "evaluating", "auditor").status_code == 403


@pytest.mark.parametrize(
    ("steps", "target"),
    [
        ([], "awarded"),  # recibiendo -> adjudicado salta la revisión
        ([], "committee_review"),  # sin evaluar
        (["evaluating"], "awarded"),
        (["evaluating"], "evaluating"),  # mismo estado
        ([], "receiving"),
    ],
)
def test_invalid_transitions_are_rejected_with_409(client, steps, target):
    pid = _create(client)
    for s in steps:
        assert _go(client, pid, s, "loader").status_code == 200
    assert _go(client, pid, target, _owner(target)).status_code == 409


def test_closed_is_terminal(client):
    pid = _create(client)
    assert _go(client, pid, "closed", "approver", "cancelado").status_code == 200
    for target in ("receiving", "evaluating", "committee_review", "awarded", "closed"):
        assert _go(client, pid, target, _owner(target), "otra vez").status_code == 409


@pytest.mark.parametrize("reason", [None, "", "   "])
def test_closing_without_awarding_requires_a_reason(client, reason):
    pid = _create(client)
    r = _go(client, pid, "closed", "approver", reason)
    assert r.status_code == 422
    assert client.get(f"/api/v1/projects/{pid}", headers=_h(client)).json()["state"] == "receiving"


def test_closing_reason_is_stored_trimmed(client):
    pid = _create(client)
    r = _go(client, pid, "closed", "approver", "  Sin propuestas válidas  ")
    assert r.json()["closing_reason"] == "Sin propuestas válidas"


def test_unknown_target_or_long_reason_is_a_validation_error(client):
    pid = _create(client)
    assert _go(client, pid, "teleported", "approver").status_code == 422
    assert _go(client, pid, "closed", "approver", "x" * 501).status_code == 422


def test_other_tenants_project_is_not_found(client):
    pid = _create(client, "alfa")
    assert _go(client, pid, "evaluating", "loader", org="beta").status_code == 404
