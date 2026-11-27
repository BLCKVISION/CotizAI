"""Seeded accounts follow the server settings, and nothing is deleted while it is being evaluated."""

from __future__ import annotations

from dataclasses import replace

from evaluador.adapters.inbound.http.aplicacion import crear_aplicacion
from evaluador.composition.configuracion import Configuracion
from evaluador.composition.semillas import apply_demo_settings
from evaluador.domain.identidad import Rol
from tests.adapters.test_evaluations_api import _project, app_client, model  # noqa: F401 - fixtures
from tests.conftest import CLAVE, cabecera

EXTRA = ("demo@cliente.test", CLAVE)


def _user(c, mail):
    return c.usuarios.por_correo(mail)


def test_removing_the_seed_settings_disables_the_seeded_accounts_and_restoring_them_enables_them(contenedor):
    apply_demo_settings(contenedor, CLAVE, EXTRA, extra_role=Rol.COORDINADOR)
    apply_demo_settings(contenedor, None, None)  # a restart after the settings were removed
    assert not _user(contenedor, "coordinador@demo.local").activo and not _user(contenedor, EXTRA[0]).activo
    assert _user(contenedor, "cargador@alfa.test").activo  # other organisations are never touched
    apply_demo_settings(contenedor, CLAVE, None)
    assert _user(contenedor, "coordinador@demo.local").activo and not _user(contenedor, EXTRA[0]).activo


def test_an_account_the_team_disabled_is_not_reenabled_by_toggling_the_seed(contenedor):
    apply_demo_settings(contenedor, CLAVE, None)
    contenedor.usuarios.guardar(replace(_user(contenedor, "auditor@demo.local"), activo=False))
    apply_demo_settings(contenedor, None, None)
    apply_demo_settings(contenedor, CLAVE, None)
    assert not _user(contenedor, "auditor@demo.local").activo


def test_a_role_changed_by_the_team_survives_a_restart_and_a_new_setting_still_applies(contenedor):
    apply_demo_settings(contenedor, CLAVE, EXTRA, extra_role=Rol.COORDINADOR)
    for mail in ("coordinador@demo.local", EXTRA[0]):
        contenedor.usuarios.guardar(replace(_user(contenedor, mail), rol=Rol.AUDITOR))
    apply_demo_settings(contenedor, CLAVE, EXTRA, extra_role=Rol.COORDINADOR)
    assert _user(contenedor, "coordinador@demo.local").rol is Rol.AUDITOR and _user(contenedor, EXTRA[0]).rol is Rol.AUDITOR
    apply_demo_settings(contenedor, CLAVE, EXTRA, extra_role=Rol.EVALUADOR)  # the server setting changed
    assert _user(contenedor, EXTRA[0]).rol is Rol.EVALUADOR


def test_starting_without_seed_settings_closes_the_demo_access(contenedor):
    apply_demo_settings(contenedor, CLAVE, None)
    crear_aplicacion(Configuracion(_env_file=None, nivel_de_log="CRITICAL", semilla_clave=None), contenedor)
    assert not _user(contenedor, "coordinador@demo.local").activo


def test_nothing_can_be_deleted_while_the_project_is_being_evaluated(app_client):  # noqa: F811
    project = _project(app_client, {"alfa.pdf": "SUPPLIER=Alfa CURRENCY=USD instalacion garantia soporte"})
    headers = cabecera(app_client, rol="coordinador")
    proposal = app_client.get(f"/api/v1/proyectos/{project}/propuestas", headers=headers).json()[0]["id"]
    container = app_client.app.state.contenedor
    with container.evaluate_project.exclusive("t-alfa", project):
        assert app_client.delete(f"/api/v1/proyectos/{project}/propuestas/{proposal}", headers=headers).status_code == 409
        assert app_client.delete(f"/api/v1/proyectos/{project}", headers=headers).status_code == 409
    assert app_client.delete(f"/api/v1/proyectos/{project}/propuestas/{proposal}", headers=headers).status_code == 204
