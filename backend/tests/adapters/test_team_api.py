"""A coordinator builds the team; roles take effect at once and never cross organisations."""

from __future__ import annotations

from evaluador.adapters.inbound.http.guards import LimitadorDeVentana
from tests.conftest import CLAVE, cabecera

PASSWORD = "Equipo-Seguro-2026!"
NEW = {"display_name": "Ana Rivas", "email": "ana@alfa.test", "password": PASSWORD, "role": "evaluador"}


def _login(client, email="ana@alfa.test", password=PASSWORD):
    return client.post("/api/v1/sesiones", json={"correo": email, "contrasena": password})


def test_a_new_member_signs_in_with_the_role_given(cliente):
    boss = cabecera(cliente, rol="coordinador")
    created = cliente.post("/api/v1/team", json=NEW, headers=boss)
    assert created.status_code == 201 and created.json()["role"] == "evaluador"
    assert "password" not in created.text and "hash" not in created.text
    session = _login(cliente)
    assert session.status_code == 201 and session.json()["usuario"]["rol"] == "evaluador"
    listed = cliente.get("/api/v1/team", headers=boss).json()
    assert listed["can_manage"] and "ana@alfa.test" in [m["email"] for m in listed["members"]]
    assert all(m["email"].endswith("@alfa.test") for m in listed["members"])


def test_role_changes_and_deactivation_apply_to_the_open_session(cliente):
    cliente.app.state.limitador_login = LimitadorDeVentana(1000)
    boss = cabecera(cliente, rol="coordinador")
    member = cliente.post("/api/v1/team", json=NEW, headers=boss).json()["id"]
    ana = {"Authorization": f"Bearer {_login(cliente).json()['token_acceso']}"}
    assert cliente.get("/api/v1/auditoria", headers=ana).status_code == 403
    assert cliente.post(f"/api/v1/team/{member}", json={"role": "auditor"}, headers=boss).status_code == 200
    audit = cliente.get("/api/v1/auditoria", headers=ana)
    assert audit.status_code == 200
    actions = [e["accion"] for e in audit.json()["eventos"]]
    assert "team_member_added" in actions and "team_role_changed" in actions and PASSWORD not in audit.text
    assert cliente.post(f"/api/v1/team/{member}", json={"active": False}, headers=boss).status_code == 200
    assert cliente.get("/api/v1/auditoria", headers=ana).status_code == 401
    assert _login(cliente).status_code == 401


def test_only_the_coordinator_manages_and_nobody_changes_themselves(cliente):
    cliente.app.state.limitador_login = LimitadorDeVentana(1000)
    for role in ("cargador", "evaluador", "aprobador", "auditor"):
        headers = cabecera(cliente, rol=role)
        assert cliente.get("/api/v1/team", headers=headers).json()["can_manage"] is False
        assert cliente.post("/api/v1/team", json=NEW, headers=headers).status_code == 403
        change = cliente.post("/api/v1/team/alfa-cargador", json={"role": "aprobador"}, headers=headers)
        assert change.status_code == 403
    boss = cabecera(cliente, rol="coordinador")
    own = cliente.post("/api/v1/team/alfa-coordinador", json={"active": False}, headers=boss)
    assert own.status_code == 422
    assert cliente.post("/api/v1/team/beta-cargador", json={"active": False}, headers=boss).status_code == 404
    assert _login(cliente, "cargador@beta.test", CLAVE).status_code == 201


def test_weak_passwords_and_taken_emails_are_rejected(cliente):
    boss = cabecera(cliente, rol="coordinador")
    weak = cliente.post("/api/v1/team", json={**NEW, "password": "abc12345"}, headers=boss)
    assert weak.status_code == 422 and "abc12345" not in weak.text
    for email in ("cargador@alfa.test", "cargador@beta.test", "sin-arroba"):
        assert cliente.post("/api/v1/team", json={**NEW, "email": email}, headers=boss).status_code == 422
    roles = {r["role"]: r["permissions"] for r in cliente.get("/api/v1/team", headers=boss).json()["roles"]}
    assert "manage_team" in roles["coordinador"] and "adjudicar_o_cerrar" not in roles["coordinador"]
