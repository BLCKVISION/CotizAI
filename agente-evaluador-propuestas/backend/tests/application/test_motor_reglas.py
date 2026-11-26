"""El motor real aplica COMPAT, CAPACIDAD, CALIDAD y ABUSIVO (nodo `reglas_tecnicas`) de extremo a extremo."""

from evaluador.domain.evaluacion import CodigoHallazgo, Veredicto

from .test_motor import evaluar, extraccion, linea, m, motor

BUENO = {"socket_cpu": "AM4", "socket_placa": "AM4", "tipo_ram": "DDR4", "tipo_ram_placa": "DDR4", "cpu_tdp_w": "65 W",
         "potencia_fuente_w": "500 W", "condicion": "nuevo"}  # fmt: skip


def con_gabinete(especificaciones=None, descripcion=None, **cambios):
    gab = linea("gabinete") | {"especificaciones": {**BUENO, **(especificaciones or {})}}
    if descripcion:
        gab["descripcion"] = descripcion
    resto = [linea(c) for c in ("monitor", "teclado", "raton", "protector")]
    return extraccion(lineas=[gab, *resto], **cambios)


def codigos(resultado) -> set[CodigoHallazgo]:
    return {h.codigo for h in resultado.hallazgos}


def test_propuesta_con_especificaciones_correctas_sigue_siendo_valida():
    mt, _ = motor(con_gabinete())
    assert evaluar(mt).veredicto is Veredicto.VALIDA


def test_incompatibilidad_de_ram_descarta_por_compat():
    mt, _ = motor(con_gabinete({"tipo_ram": "DDR5-5600"}))
    r = evaluar(mt)
    assert r.veredicto is Veredicto.DESCARTADA and CodigoHallazgo.COMPAT in codigos(r)


def test_fuente_insuficiente_descarta_por_capacidad():
    mt, _ = motor(con_gabinete({"potencia_fuente_w": "200 W"}))
    r = evaluar(mt)
    assert r.veredicto is Veredicto.DESCARTADA and CodigoHallazgo.CAPACIDAD in codigos(r)


def test_equipo_reacondicionado_descarta_por_calidad():
    mt, _ = motor(con_gabinete(descripcion="Gabinete reacondicionado"))
    r = evaluar(mt)
    assert r.veredicto is Veredicto.DESCARTADA and CodigoHallazgo.CALIDAD in codigos(r)


def test_flete_desmedido_descarta_por_abusivo():
    mt, _ = motor(con_gabinete(condiciones={"flete": m("4000")}))
    r = evaluar(mt)
    assert r.veredicto is Veredicto.DESCARTADA and CodigoHallazgo.ABUSIVO in codigos(r)


def test_dato_tecnico_ambiguo_pide_revision_y_no_descarta():
    mt, _ = motor(con_gabinete({"potencia_fuente_w": "2 x 500 W"}))
    r = evaluar(mt)
    assert r.veredicto is Veredicto.PENDIENTE_DE_REVISION and CodigoHallazgo.LECTURA in codigos(r)
