"""Regresiones de la revisión de código de las reglas #9 a #14: cada caso reproduce un fallo real confirmado.

Criterio común: ante un dato ambiguo o ilegible NO se descarta (se pide revisión); descartar mal a un proveedor
es el peor fallo posible en una licitación.
"""

from datetime import date
from decimal import Decimal

import pytest
from pydantic import ValidationError

from evaluador.domain import especificaciones as esp
from evaluador.domain.costo import calcular_costo_real, convertir_costo
from evaluador.domain.errores import DatoInvalido, TasaNoDisponible
from evaluador.domain.evaluacion import CodigoHallazgo, Veredicto
from evaluador.domain.extraccion import Condiciones, ExtraccionPropuesta, Linea, Monto, Recargo, Totales
from evaluador.domain.moneda import OrigenDeTasa, TasaDeCambio
from evaluador.domain.puntaje import Pesos, PuntajeCriterio, RubricaPuntuada
from evaluador.domain.ranking import Candidata, ParametrosDeRanking
from evaluador.domain.reglas.abusivo import ReferenciaDeMercado, validar_abuso
from evaluador.domain.reglas.calidad import validar_calidad
from evaluador.domain.reglas.capacidad import validar_capacidad
from evaluador.domain.reglas.compatibilidad import validar_compatibilidad


def m(v: str) -> Monto:
    return Monto(literal=v, valor=v)


def linea(categoria="gabinete", descripcion="Equipo", cant="11", total="1100", **specs) -> Linea:
    return Linea(
        descripcion=descripcion, categoria=categoria, cantidad=m(cant), precio_unitario=m("100"),
        total_linea=m(total), especificaciones={k: str(v) for k, v in specs.items()},
    )  # fmt: skip


def prop(*lineas, moneda="USD", **kw) -> ExtraccionPropuesta:
    return ExtraccionPropuesta(moneda=moneda, lineas=list(lineas), **kw)


def solo_revision(hallazgos) -> bool:
    return len(hallazgos) == 1 and hallazgos[0].codigo == CodigoHallazgo.LECTURA and not hallazgos[0].descarta


# ---------------------------------------------------------------- lectura de medidas
@pytest.mark.parametrize(
    ("texto", "esperado"),
    [
        ("650 W", 650),
        ("650W", 650),
        ("1.200 W", 1200),
        ("1,200 W", 1200),
        ("1.5 kW", 1500),
        ("0.500 W", Decimal("0.5")),
    ],
)
def test_leer_medida_acepta_formatos_completos(texto, esperado):
    assert esp.leer_medida(texto, esp.VATIOS) == Decimal(esperado)


@pytest.mark.parametrize(
    "texto", ["2 x 500 W", "1500VA/900W", "Max-330mm", "450W (80+)", "-300 W", "12 parsecs", "", "N/D"]
)
def test_leer_medida_rechaza_lo_ambiguo_en_vez_de_adivinar(texto):
    assert esp.leer_medida(texto, esp.VATIOS) is None


def test_leer_medida_convierte_unidades():
    assert esp.leer_medida("30 cm", esp.MILIMETROS) == Decimal(300)
    assert esp.leer_medida("1.200 mm", esp.MILIMETROS) == Decimal(1200)


# ---------------------------------------------------------------- COMPAT
@pytest.mark.parametrize(
    ("cpu", "placa"),
    [
        ("Socket LGA1700", "LGA1700"),
        ("AM5 (Ryzen 7000)", "AM5"),
        ("LGA 1700 (12th gen)", "Socket LGA-1700"),
        ("Socket AM4", "am4"),
    ],
)
def test_compat_socket_con_palabras_extra_no_es_incompatible(cpu, placa):
    assert validar_compatibilidad(prop(linea(socket_cpu=cpu, socket_placa=placa))) == []


def test_compat_sockets_realmente_distintos_siguen_descartando():
    (h,) = validar_compatibilidad(prop(linea(socket_cpu="Socket AM4", socket_placa="LGA 1700 (12th gen)")))
    assert h.descarta


def test_compat_placa_que_soporta_dos_generaciones_pide_revision():
    assert solo_revision(validar_compatibilidad(prop(linea(tipo_ram="DDR5", tipo_ram_placa="DDR4/DDR5"))))
    assert solo_revision(validar_compatibilidad(prop(linea(tipo_ram="DDR4", tipo_ram_placa="DDR5 (compatible DDR4)"))))


def test_compat_lpddr_soldada_no_pasa_como_ddr_de_ranura():
    assert solo_revision(validar_compatibilidad(prop(linea(tipo_ram="LPDDR4", tipo_ram_placa="DDR4"))))


def test_compat_guion_en_la_medida_no_se_lee_como_signo_negativo():
    assert solo_revision(validar_compatibilidad(prop(linea(longitud_gpu_mm="300 mm", max_gpu_mm="Max-330mm"))))


def test_compat_respeta_la_unidad_de_la_tarjeta():
    (h,) = validar_compatibilidad(prop(linea(longitud_gpu_mm="35 cm", max_gpu_mm="320 mm")))
    assert h.descarta
    assert validar_compatibilidad(prop(linea(longitud_gpu_mm="30 cm", max_gpu_mm="320 mm"))) == []


def test_compat_rdimm_no_encaja_en_placa_dimm_de_escritorio():
    (h,) = validar_compatibilidad(prop(linea(formato_ram="RDIMM", formato_ram_placa="DIMM")))
    assert h.descarta
    assert validar_compatibilidad(prop(linea(formato_ram="UDIMM", formato_ram_placa="DIMM"))) == []


# ---------------------------------------------------------------- CAPACIDAD
def equipo(**kw):
    return linea("gabinete", cpu_tdp_w="65", **kw)


def test_capacidad_fuente_de_mas_de_mil_vatios_no_se_lee_como_1_2_w():
    assert validar_capacidad(prop(equipo(potencia_fuente_w="1.200 W"))) == []
    assert validar_capacidad(prop(equipo(potencia_fuente_w="1,200 W"))) == []


@pytest.mark.parametrize("texto", ["2 x 500 W", "650W (80+ Bronze)"])
def test_capacidad_potencia_ambigua_pide_revision_no_descarta(texto):
    assert solo_revision(validar_capacidad(prop(equipo(potencia_fuente_w=texto))))


def test_capacidad_ups_con_va_y_vatios_juntos_no_pasa_como_vatios():
    ups = linea("ups", cant="11", potencia_ups_w="1500VA/900W")
    assert solo_revision(validar_capacidad(prop(equipo(), ups)))


@pytest.mark.parametrize("gpu", ["N/D", "RTX 4090 450W"])
def test_capacidad_tdp_de_gpu_ilegible_no_cuenta_como_cero(gpu):
    hs = validar_capacidad(prop(equipo(potencia_fuente_w="250", gpu_tdp_w=gpu)))
    assert hs and all(h.codigo == CodigoHallazgo.LECTURA and not h.descarta for h in hs)


def test_capacidad_cantidad_de_ups_fraccionaria_pide_revision():
    ups = linea("ups", cant="0.5", potencia_ups_w="900")
    assert solo_revision(validar_capacidad(prop(equipo(), ups)))


# ---------------------------------------------------------------- CALIDAD
@pytest.mark.parametrize(
    "texto", ["Procesador Intel Core de segunda generación", "Licencia renovada por 3 años", "Empaque reciclado 100 %"]
)
def test_calidad_terminos_ambiguos_o_ajenos_no_descartan(texto):
    hs = validar_calidad(prop(linea(descripcion=texto)))
    assert all(not h.descarta for h in hs)  # a lo sumo pide revisión


def test_calidad_usado_en_el_campo_condicion_si_descarta_pero_en_texto_libre_solo_revisa():
    assert validar_calidad(prop(linea(condicion="usado")))[0].descarta
    assert solo_revision(validar_calidad(prop(linea(descripcion="Monitor USADO"))))


@pytest.mark.parametrize(
    "texto",
    ["No ha sido usado", "nunca ha sido usado", "No fue reacondicionado", "Nuevo, jamás usado", "sin ser usado"],
)
def test_calidad_negaciones_de_frase_completa_no_descartan(texto):
    assert validar_calidad(prop(linea(descripcion=texto))) == []


@pytest.mark.parametrize(
    "texto", ["Refurbished unit", "second-hand laptop", "pre-owned", "Reacondicionádo", "Seminuevo", "RECONDICIONADO"]
)
def test_calidad_terminos_inequivocos_en_otros_idiomas_y_con_acentos_descartan(texto):
    assert validar_calidad(prop(linea(descripcion=texto)))[0].descarta


def test_calidad_negacion_no_cruza_comas():
    assert validar_calidad(prop(linea(descripcion="no nuevo, reacondicionado")))[0].descarta


@pytest.mark.parametrize("anio", ["2016-2019", "2015/2019", "Q3 2012 o 2020"])
def test_calidad_rangos_de_anios_son_ambiguos_y_piden_revision(anio):
    assert solo_revision(validar_calidad(prop(linea(anio_lanzamiento=anio))))


def test_calidad_fecha_completa_usa_el_unico_anio():
    assert validar_calidad(prop(linea(anio_lanzamiento="12/05/2012")))[0].descarta
    assert validar_calidad(prop(linea(anio_lanzamiento="12/05/2022"))) == []


# ---------------------------------------------------------------- ABUSIVO
@pytest.mark.parametrize(
    "nota",
    [
        "Prueba gratuita, no tiene costo",
        "Diagnóstico gratis; no se cobra",
        "Test: no se cobra",
        "prueba piloto, con costo cero",
        "evaluación de riesgos facturada mensual",
    ],
)
def test_abuso_pruebas_gratuitas_o_negadas_no_descartan(nota):
    assert validar_abuso(prop(linea(), notas_literales=[nota])) == []


@pytest.mark.parametrize(
    "garantia",
    ["Garantía válida únicamente fuera de Venezuela", "Warranty valid only abroad", "Garantía solo en el extranjero"],
)
def test_abuso_garantia_en_el_exterior_en_mas_formas(garantia):
    assert validar_abuso(prop(linea(), condiciones=Condiciones(garantia=garantia)))[0].descarta


def test_abuso_garantia_nacional_con_tramite_desde_el_exterior_no_descarta():
    assert (
        validar_abuso(
            prop(linea(), condiciones=Condiciones(garantia="Garantía: nacional; solo tramitada desde el exterior"))
        )
        == []
    )


def test_abuso_sin_moneda_en_la_propuesta_no_compara_a_ciegas():
    refs = {1: ReferenciaDeMercado(Decimal("1"), "USD", fuentes=3)}
    assert solo_revision(validar_abuso(prop(linea(), moneda=None), refs))


def test_abuso_umbral_se_muestra_sin_redondeo_enganoso():
    from evaluador.domain.reglas.abusivo import ParametrosDeAbuso

    refs = {1: ReferenciaDeMercado(Decimal("100"), "USD", fuentes=2)}
    caro = Linea(descripcion="x", categoria="x", cantidad=m("1"), precio_unitario=m("200"), total_linea=m("200"))
    (h,) = validar_abuso(prop(caro), refs, ParametrosDeAbuso(umbral_sobreprecio=Decimal("0.125")))
    assert "12.5 %" in h.motivo  # antes decía «12 %» por redondear la mitad hacia el par


# ---------------------------------------------------------------- costo real
def test_costo_sin_lineas_ni_subtotal_no_tiene_base_ni_es_cero():
    costo = calcular_costo_real(prop(totales=Totales(impuestos=[m("16")])))
    assert costo.total is None and "Monto base" in costo.indeterminados


def test_costo_impuestos_incluidos_junto_con_flete_no_se_duplican():
    e = prop(
        linea(total="100"),
        totales=Totales(subtotal=m("100"), impuestos=[m("16")], total=m("110")),
        condiciones=Condiciones(flete=m("10")),
    )
    assert calcular_costo_real(e).total == Decimal("110")


def test_costo_total_declarado_con_impuesto_sin_desglosar_no_se_ignora_en_silencio():
    e = prop(linea(total="100"), totales=Totales(subtotal=m("100"), total=m("116")))
    costo = calcular_costo_real(e)
    assert costo.total is None and "Diferencia sin explicar frente al total declarado" in costo.indeterminados


def test_costo_total_declarado_que_si_cuadra_con_flete_aparte_es_completo():
    e = prop(
        linea(total="100"), totales=Totales(subtotal=m("100"), total=m("100")), condiciones=Condiciones(flete=m("10"))
    )
    assert calcular_costo_real(e).total == Decimal("110")


@pytest.mark.parametrize("donde", ["flete", "recargo", "impuesto"])
def test_costo_montos_negativos_son_no_determinados_no_descuentos(donde):
    cond = {
        "flete": Condiciones(flete=m("-500")),
        "recargo": Condiciones(recargos=[Recargo(concepto="x", monto=m("-5"))]),
    }.get(donde, Condiciones())
    tot = Totales(impuestos=[m("-16")]) if donde == "impuesto" else Totales()
    costo = calcular_costo_real(prop(linea(total="100"), condiciones=cond, totales=tot))
    assert costo.total is None and not costo.completo


def test_costo_moneda_en_minusculas_o_con_espacios_se_normaliza():
    costo = calcular_costo_real(prop(linea(total="100"), moneda=" usd "))
    assert costo.moneda == "USD"
    assert convertir_costo(costo, "USD", []).total == Decimal("100")
    with pytest.raises(TasaNoDisponible):
        convertir_costo(costo, "EUR", [])


def test_tasa_con_fuente_invisible_se_rechaza():
    with pytest.raises(DatoInvalido):
        TasaDeCambio("USD", "VES", Decimal("36"), "​ ​", date(2026, 11, 1), OrigenDeTasa.MANUAL)


# ---------------------------------------------------------------- ranking y rúbrica
@pytest.mark.parametrize("puntaje", [Decimal("NaN"), Decimal("Infinity"), Decimal("-1"), Decimal(500), 90.5, 90])
def test_candidata_valida_rechaza_puntajes_imposibles(puntaje):
    with pytest.raises(DatoInvalido):
        Candidata("a", Veredicto.VALIDA, puntaje)


@pytest.mark.parametrize("costo", [Decimal("NaN"), Decimal("-5"), 10.5])
def test_candidata_rechaza_costos_imposibles(costo):
    with pytest.raises(DatoInvalido):
        Candidata("a", Veredicto.VALIDA, Decimal(80), costo)


def test_delta_debe_ser_decimal():
    with pytest.raises(DatoInvalido):
        ParametrosDeRanking(delta=3)  # type: ignore[arg-type]


@pytest.mark.parametrize("puntaje", [True, "80", 80.0, 80.5])
def test_puntaje_de_la_rubrica_es_estricto(puntaje):
    with pytest.raises(ValidationError):
        PuntajeCriterio(puntaje=puntaje, evidencia=["cita"])


def test_rubrica_rechaza_campos_mal_escritos_y_limpia_evidencia():
    with pytest.raises(ValidationError):
        PuntajeCriterio(puntage=1)  # type: ignore[call-arg]
    assert PuntajeCriterio(puntaje=0, evidencia=[" ", " cita "]).evidencia == ["cita"]
    ok = {"puntaje": 10, "evidencia": ["x"]}
    with pytest.raises(ValidationError):
        RubricaPuntuada.model_validate(
            {"rendimiento": ok, "proteccion_y_perifericos": ok, "garantia_y_soporte": ok, "extra": 1}
        )


@pytest.mark.parametrize("pesos", [(True, True, 98), (55.0, 20.0, 25.0), (50.5, 24.5, 25)])
def test_pesos_solo_enteros_reales(pesos):
    with pytest.raises(DatoInvalido):
        Pesos(*pesos)
