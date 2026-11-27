"""COMPAT, CAPACIDAD, CALIDAD y ABUSIVO: un caso por causa de descarte y los bordes que no deben descartar."""

from decimal import Decimal

import pytest

from evaluador.domain.errores import DatoInvalido
from evaluador.domain.evaluacion import CodigoHallazgo
from evaluador.domain.extraccion import Condiciones, ExtraccionPropuesta, Linea, Monto, Totales
from evaluador.domain.reglas.abusivo import ParametrosDeAbuso, ReferenciaDeMercado, validar_abuso
from evaluador.domain.reglas.calidad import ParametrosDeCalidad, validar_calidad
from evaluador.domain.reglas.capacidad import ParametrosDeCapacidad, validar_capacidad
from evaluador.domain.reglas.compatibilidad import validar_compatibilidad
from evaluador.domain.verification import unverified_checks


def m(v: str) -> Monto:
    return Monto(literal=v, valor=v)


def linea(categoria="gabinete", descripcion="Equipo", cant="11", precio="100", total="1100", **specs) -> Linea:
    return Linea(
        descripcion=descripcion, categoria=categoria, cantidad=m(cant), precio_unitario=m(precio),
        total_linea=m(total), especificaciones={k: str(v) for k, v in specs.items()},
    )  # fmt: skip


def prop(*lineas, moneda="USD", **kw) -> ExtraccionPropuesta:
    return ExtraccionPropuesta(moneda=moneda, lineas=list(lineas), **kw)


# ------------------------------------------------------------------ COMPAT
def test_compat_socket_distinto_descarta_y_cita():
    (h,) = validar_compatibilidad(prop(linea(socket_cpu="AM4", socket_placa="LGA1700")))
    assert h.codigo == CodigoHallazgo.COMPAT and h.descarta and "AM4" in h.motivo and "LGA1700" in h.motivo


def test_compat_ignora_formato_y_mayusculas():
    assert validar_compatibilidad(prop(linea(socket_cpu="lga 1700", socket_placa="LGA-1700"))) == []
    assert validar_compatibilidad(prop(linea(tipo_ram="DDR4-3200", tipo_ram_placa="ddr4"))) == []


def test_compat_ram_ddr5_en_placa_ddr4_descarta():
    (h,) = validar_compatibilidad(prop(linea(tipo_ram="DDR5-5600", tipo_ram_placa="DDR4")))
    assert h.descarta and h.codigo == CodigoHallazgo.COMPAT


def test_compat_formato_sodimm_en_ranura_dimm_descarta():
    (h,) = validar_compatibilidad(prop(linea(formato_ram="SO-DIMM", formato_ram_placa="DIMM")))
    assert h.descarta


def test_compat_gpu_mas_larga_que_el_gabinete_descarta():
    (h,) = validar_compatibilidad(prop(linea(longitud_gpu_mm="320 mm", max_gpu_mm="300")))
    assert h.descarta and "320" in h.motivo and "300" in h.motivo


def test_compat_gpu_que_cabe_justa_no_descarta():
    assert validar_compatibilidad(prop(linea(longitud_gpu_mm="300", max_gpu_mm="300"))) == []


def test_compat_falta_una_mitad_pide_revision_y_no_descarta():
    (h,) = validar_compatibilidad(prop(linea(socket_cpu="AM4")))
    assert h.codigo == CodigoHallazgo.LECTURA and not h.descarta and "socket_placa" in h.motivo


def test_compat_valor_no_interpretable_no_descarta():
    (h,) = validar_compatibilidad(prop(linea(tipo_ram="rápida", tipo_ram_placa="DDR4")))
    assert h.codigo == CodigoHallazgo.LECTURA and not h.descarta


def test_compat_no_cruza_lineas_de_equipos_distintos():
    a = linea(socket_cpu="AM4", socket_placa="AM4")
    b = linea(socket_cpu="LGA1700", socket_placa="LGA1700")
    assert validar_compatibilidad(prop(a, b)) == []


def test_compat_motivo_acota_valores_del_documento():
    largo = "X" * 500
    (h,) = validar_compatibilidad(prop(linea(socket_cpu=largo, socket_placa="AM4")))
    assert len(h.motivo) < 200


# ------------------------------------------------------------------ CAPACIDAD
def equipo(**kw):
    return linea("gabinete", cpu_tdp_w="65", **kw)  # consumo = 65 + 0 + 100 base = 165 W; con margen 1.25 -> 206,25 W


def test_capacidad_fuente_insuficiente_descarta():
    (h,) = validar_capacidad(prop(equipo(potencia_fuente_w="200 W")))
    assert h.codigo == CodigoHallazgo.CAPACIDAD and h.descarta and "206" in h.motivo


def test_capacidad_fuente_suficiente_con_margen_no_descarta():
    assert validar_capacidad(prop(equipo(potencia_fuente_w="450"))) == []


def test_capacidad_incluye_gpu_en_el_consumo():
    (h,) = validar_capacidad(prop(equipo(potencia_fuente_w="300", gpu_tdp_w="200")))
    assert h.descarta  # 65+200+100 = 365 W * 1.25


def test_capacidad_fuente_sin_tdp_de_ningun_equipo_queda_sin_verificar():
    proposal = prop(linea(potencia_fuente_w="500"))
    assert validar_capacidad(proposal) == []
    assert "CAPACIDAD" in unverified_checks(proposal)


def test_capacidad_fuente_ilegible_pide_revision():
    (h,) = validar_capacidad(prop(equipo(potencia_fuente_w="buena")))
    assert h.codigo == CodigoHallazgo.LECTURA and not h.descarta


def test_capacidad_ups_en_va_sin_vatios_no_basta():
    ups = linea("ups", cant="11", potencia_ups_va="1000")
    (h,) = validar_capacidad(prop(equipo(), ups))
    assert h.codigo == CodigoHallazgo.LECTURA and not h.descarta and "VA" in h.motivo


def test_capacidad_ups_una_por_equipo_suficiente():
    ups = linea("ups", cant="11", potencia_ups_w="600")  # (165+40)*1*1.25 = 256,25
    assert validar_capacidad(prop(equipo(), ups)) == []


def test_capacidad_ups_unica_para_todo_el_laboratorio_es_insuficiente():
    ups = linea("ups", cant="1", potencia_ups_w="1500")  # (165+40)*11*1.25 = 2818,75
    (h,) = validar_capacidad(prop(equipo(), ups))
    assert h.descarta and "11 equipo" in h.motivo


def test_capacidad_reparte_los_equipos_entre_las_ups_redondeando_hacia_arriba():
    ups = linea("ups", cant="4", potencia_ups_w="800")  # ceil(11/4)=3 -> 205*3*1.25 = 768,75
    assert validar_capacidad(prop(equipo(), ups)) == []
    debil = linea("ups", cant="4", potencia_ups_w="700")
    assert validar_capacidad(prop(equipo(), debil))[0].descarta


def test_capacidad_parametros_invalidos_se_rechazan():
    with pytest.raises(DatoInvalido):
        ParametrosDeCapacidad(margen=Decimal("0.9"))


# ------------------------------------------------------------------ CALIDAD
@pytest.mark.parametrize("texto", ["Laptop reacondicionada", "Monitor refurbished", "Gabinete second-hand", "Open box"])
def test_calidad_condicion_no_nueva_descarta(texto):
    (h,) = validar_calidad(prop(linea(descripcion=texto)))
    assert h.codigo == CodigoHallazgo.CALIDAD and h.descarta


def test_calidad_condicion_en_especificaciones():
    (h,) = validar_calidad(prop(linea(condicion="reciclado")))
    assert h.descarta


def test_calidad_negacion_no_descarta():
    assert validar_calidad(prop(linea(descripcion="Equipo nuevo, no reacondicionado, sin usar"))) == []


def test_calidad_nuevo_no_descarta():
    assert validar_calidad(prop(linea(condicion="nuevo"))) == []


def test_calidad_nota_de_la_propuesta_cuenta():
    (h,) = validar_calidad(prop(linea(), notas_literales=["Los monitores son reacondicionados de fábrica"]))
    assert h.descarta


def test_calidad_obsoleto_por_anio():
    (h,) = validar_calidad(prop(linea(anio_lanzamiento="2012")))
    assert h.descarta and "2012" in h.motivo
    assert validar_calidad(prop(linea(anio_lanzamiento="2018"))) == []


def test_calidad_anio_ilegible_pide_revision():
    (h,) = validar_calidad(prop(linea(anio_lanzamiento="viejo")))
    assert h.codigo == CodigoHallazgo.LECTURA and not h.descarta


def test_calidad_ram_ddr3_obsoleta_y_parametrizable():
    assert validar_calidad(prop(linea(tipo_ram="DDR3-1600")))[0].descarta
    assert validar_calidad(prop(linea(tipo_ram="DDR3")), ParametrosDeCalidad(tipos_ram_obsoletos=frozenset())) == []


# ------------------------------------------------------------------ ABUSIVO
def test_abuso_sobreprecio_con_dos_fuentes_descarta():
    refs = {1: ReferenciaDeMercado(Decimal("100"), "USD", fuentes=2)}
    (h,) = validar_abuso(prop(linea(precio="200")), refs)
    assert h.codigo == CodigoHallazgo.ABUSIVO and h.descarta


def test_abuso_una_sola_fuente_no_basta_para_descartar():
    refs = {1: ReferenciaDeMercado(Decimal("100"), "USD", fuentes=1)}
    (h,) = validar_abuso(prop(linea(precio="200")), refs)
    assert h.codigo == CodigoHallazgo.ABUSIVO and not h.descarta and "sola fuente" in h.motivo


def test_abuso_precio_dentro_del_umbral_no_descarta():
    refs = {1: ReferenciaDeMercado(Decimal("100"), "USD", fuentes=3)}
    assert validar_abuso(prop(linea(precio="130")), refs) == []  # justo en 30 %
    assert validar_abuso(prop(linea(precio="130.01")), refs)[0].descarta


def test_abuso_umbral_configurable():
    refs = {1: ReferenciaDeMercado(Decimal("100"), "USD", fuentes=2)}
    assert validar_abuso(prop(linea(precio="150")), refs, ParametrosDeAbuso(umbral_sobreprecio=Decimal("0.6"))) == []


def test_abuso_moneda_distinta_pide_conversion_en_vez_de_comparar():
    refs = {1: ReferenciaDeMercado(Decimal("100"), "VES", fuentes=3)}
    (h,) = validar_abuso(prop(linea(precio="999")), refs)
    assert h.codigo == CodigoHallazgo.LECTURA and not h.descarta


def test_abuso_referencia_a_linea_inexistente_es_error():
    with pytest.raises(DatoInvalido):
        validar_abuso(prop(linea()), {5: ReferenciaDeMercado(Decimal("1"), "USD", 2)})


def test_abuso_flete_desmedido_descarta():
    e = prop(linea(total="1000"), condiciones=Condiciones(flete=m("300")))
    (h,) = validar_abuso(e)
    assert h.descarta and "Flete" in h.motivo


def test_abuso_flete_razonable_o_sin_monto_no_descarta():
    assert validar_abuso(prop(linea(total="1000"), condiciones=Condiciones(flete=m("100")))) == []
    assert (
        validar_abuso(prop(linea(total="1000"), condiciones=Condiciones(flete=Monto(literal="a convenir", valor=""))))
        == []
    )


def test_abuso_usa_el_subtotal_declarado_como_base():
    e = prop(linea(total="1000"), totales=Totales(subtotal=m("5000")), condiciones=Condiciones(flete=m("300")))
    assert validar_abuso(e) == []


@pytest.mark.parametrize(
    "garantia",
    [
        "Garantía válida únicamente en el exterior del país",
        "La garantía se hará efectiva solo en el extranjero.",
        "Garantía exclusivamente fuera del país",
    ],
)
def test_abuso_garantia_solo_en_el_exterior(garantia):
    (h,) = validar_abuso(prop(linea(), condiciones=Condiciones(garantia=garantia)))
    assert h.descarta and "exterior" in h.motivo


def test_abuso_garantia_local_no_descarta():
    assert validar_abuso(prop(linea(), condiciones=Condiciones(garantia="Garantía de 3 años en el país"))) == []


def test_abuso_prueba_que_luego_se_cobra():
    (h,) = validar_abuso(prop(linea(), notas_literales=["La prueba de funcionamiento se cobra aparte"]))
    assert h.descarta and "Prueba" in h.motivo
