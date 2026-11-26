"""Contrato de extracción: montos (literal, valor, null) y evidencia por línea."""

from evaluador.domain.contrato import literal_coincide, validar_contrato
from evaluador.domain.evaluacion import CodigoHallazgo
from evaluador.domain.extraccion import Evidencia, ExtraccionPropuesta, Linea, Monto, Totales
from evaluador.domain.reglas.alcance import validar_alcance_fijo
from evaluador.domain.reglas.aritmetica import validar_aritmetica


def m(literal: str, valor: str) -> Monto:
    return Monto(literal=literal, valor=valor)


def linea(**kw) -> Linea:
    base = dict(
        descripcion="Monitor", categoria="monitor", cantidad=m("11", "11"), precio_unitario=m("100,00", "100.00"),
        total_linea=m("1.100,00", "1100.00"), evidencia=Evidencia(pagina_o_celda="p.1", texto="Monitor 11 x 100,00"),
    )  # fmt: skip
    return Linea(**(base | kw))


def ext(*lineas: Linea, **kw) -> ExtraccionPropuesta:
    return ExtraccionPropuesta(lineas=list(lineas), **kw)


def test_contrato_valido_no_tiene_problemas():
    assert validar_contrato(ext(linea(), totales=Totales(total=m("1.100,00", "1100.00")))) == []


def test_cantidad_y_precio_pueden_ser_null_sin_romper_el_modelo():
    e = ext(linea(cantidad=None, precio_unitario=None, total_linea=None))
    assert validar_contrato(e) == []
    assert e.lineas[0].cantidad is None


def test_linea_sin_evidencia_es_problema():
    (p,) = validar_contrato(ext(linea(evidencia=Evidencia())))
    assert "Línea 1" in p and "evidencia" in p


def test_evidencia_solo_con_espacios_no_cuenta():
    assert validar_contrato(ext(linea(evidencia=Evidencia(pagina_o_celda="p.1", texto="  "))))


def test_valor_no_numerico_con_literal_es_problema():
    (p,) = validar_contrato(ext(linea(precio_unitario=m("100,00", "cien"))))
    assert "precio_unitario" in p


def test_valor_sin_literal_es_valor_inventado():
    (p,) = validar_contrato(ext(linea(cantidad=m("", "11"))))
    assert "cantidad" in p


def test_valor_que_no_corresponde_al_literal_es_problema():
    # el modelo «corrigió» 1.100,00 a 1000.00: el contrato lo rechaza
    (p,) = validar_contrato(ext(linea(total_linea=m("1.100,00", "1000.00"))))
    assert "total_linea" in p


def test_totales_tambien_se_validan():
    (p,) = validar_contrato(ext(linea(), totales=Totales(subtotal=m("1.100,00", "9999"))))
    assert "subtotal" in p


def test_literal_con_formatos_regionales():
    assert literal_coincide("1.100,00", "1100.00")
    assert literal_coincide("1,100.00", "1100.00")
    assert literal_coincide("$ 1 100,50", "1100.50")
    assert literal_coincide("11", "11")
    assert literal_coincide("1.100", "1100")  # miles
    assert literal_coincide("1,5", "1.5")
    assert not literal_coincide("1.100,00", "1100.01")
    assert not literal_coincide("abc", "1")


def test_reglas_toleran_montos_null_y_piden_revision_en_vez_de_fallar():
    e = ext(linea(cantidad=None, precio_unitario=None))
    assert [h.codigo for h in validar_aritmetica(e)] == [CodigoHallazgo.LECTURA]
    assert all(not h.descarta for h in validar_alcance_fijo(e) if h.codigo is CodigoHallazgo.LECTURA)
