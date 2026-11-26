from datetime import UTC, datetime, timedelta

import pytest

from evaluador.domain.errores import SinPermiso
from evaluador.domain.identidad import PERMISOS_POR_ROL, Permiso, PoliticaDeSesion, Rol, Sesion, Usuario

AHORA = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)
POL = PoliticaDeSesion()


def usuario(rol=Rol.CARGADOR) -> Usuario:
    return Usuario(id="u", tenant_id="t", correo="a@b.co", hash_contrasena="h", rol=rol)


def sesion(**kw) -> Sesion:
    base = dict(id="s", tenant_id="t", usuario_id="u", token_hash="x", creada=AHORA,
                expira=AHORA + timedelta(hours=8), ultima_actividad=AHORA)  # fmt: skip
    return Sesion(**{**base, **kw})


def test_todos_los_roles_tienen_permisos_y_solo_aprobador_adjudica():
    assert set(PERMISOS_POR_ROL) == set(Rol)
    con = [r for r in Rol if Permiso.ADJUDICAR_O_CERRAR in PERMISOS_POR_ROL[r]]
    assert con == [Rol.APROBADOR]


def test_solo_auditor_ve_auditoria_y_auditor_no_escribe():
    assert [r for r in Rol if usuario(r).tiene(Permiso.VER_AUDITORIA)] == [Rol.AUDITOR]
    assert not usuario(Rol.AUDITOR).tiene(Permiso.CREAR_PROYECTO)


def test_exigir_lanza_sin_permiso():
    with pytest.raises(SinPermiso):
        usuario(Rol.AUDITOR).exigir(Permiso.CREAR_PROYECTO)
    usuario().exigir(Permiso.CREAR_PROYECTO)


def test_bloqueo_tras_maximo_de_fallos_y_expira():
    u = usuario()
    for _ in range(POL.max_intentos_fallidos - 1):
        u = u.con_fallo(AHORA, POL)
        assert not u.esta_bloqueado(AHORA)
    u = u.con_fallo(AHORA, POL)
    assert u.esta_bloqueado(AHORA) and u.intentos_fallidos == 0
    assert not u.esta_bloqueado(AHORA + timedelta(minutes=POL.minutos_de_bloqueo))


def test_exito_reinicia_contadores():
    u = usuario().con_fallo(AHORA, POL).con_exito()
    assert u.intentos_fallidos == 0 and u.bloqueado_hasta is None


def test_sesion_valida_expirada_inactiva_y_revocada():
    assert sesion().es_valida(AHORA, POL)
    assert not sesion().es_valida(AHORA + timedelta(hours=8), POL)
    assert not sesion().es_valida(AHORA + timedelta(minutes=POL.minutos_de_inactividad), POL)
    assert not sesion().revocar().es_valida(AHORA, POL)


def test_actividad_renueva_inactividad_pero_no_la_vida_maxima():
    s = sesion().con_actividad(AHORA + timedelta(minutes=25))
    assert s.es_valida(AHORA + timedelta(minutes=50), POL)
    assert not s.es_valida(AHORA + timedelta(hours=8, minutes=1), POL)
