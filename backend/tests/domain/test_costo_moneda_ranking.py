"""Costo real, conversión de moneda, rúbrica y ranking."""

from datetime import date
from decimal import Decimal

import pytest
from pydantic import ValidationError

from evaluador.domain.costo import calcular_costo_real, convertir_costo
from evaluador.domain.errores import DatoInvalido, TasaNoDisponible
from evaluador.domain.evaluacion import Veredicto
from evaluador.domain.extraccion import Condiciones, ExtraccionPropuesta, Linea, Monto, Recargo, Totales
from evaluador.domain.moneda import OrigenDeTasa, TasaDeCambio, convertir
from evaluador.domain.puntaje import Pesos, PuntajeCriterio, RubricaPuntuada, puntaje_total
from evaluador.domain.ranking import Candidata, ParametrosDeRanking, ordenar_ranking


def m(v: str, literal: str | None = None) -> Monto:
    return Monto(literal=literal or v, valor=v)


def linea(categoria="gabinete", total="1000") -> Linea:
    return Linea(
        descripcion=categoria, categoria=categoria, cantidad=m("1"), precio_unitario=m(total), total_linea=m(total)
    )


def prop(*lineas, **kw) -> ExtraccionPropuesta:
    return ExtraccionPropuesta(moneda=kw.pop("moneda", "USD"), lineas=list(lineas), **kw)


def tasa(de="USD", a="VES", valor="36.50", dia=1) -> TasaDeCambio:
    return TasaDeCambio(de, a, Decimal(valor), "BCV", date(2026, 11, dia), OrigenDeTasa.BCV)


# ------------------------------------------------------------------ costo real
def test_costo_suma_base_flete_instalacion_recargos_e_impuestos():
    e = prop(
        linea(total="1000"),
        totales=Totales(subtotal=m("1000"), impuestos=[m("160")], total=m("1160")),
        condiciones=Condiciones(
            flete=m("50"), instalacion=m("30"), recargos=[Recargo(concepto="Seguro", monto=m("20"))]
        ),
    )
    costo = calcular_costo_real(e)
    assert costo.total == Decimal("1260") and costo.completo and costo.moneda == "USD"
    assert [p.concepto for p in costo.pasos] == [
        "Monto base",
        "Flete o traslado",
        "Instalación",
        "Recargo: Seguro",
        "Impuesto 1",
    ]


def test_costo_recargo_porcentual_muestra_su_base():
    e = prop(linea(total="1000"), condiciones=Condiciones(recargos=[Recargo(concepto="Comisión", porcentaje=m("2.5"))]))
    paso = calcular_costo_real(e).pasos[1]
    assert paso.monto == Decimal("25.00") and "1000" in paso.detalle and "2.5" in paso.detalle


def test_costo_sin_monto_es_no_determinado_y_no_cero():
    e = prop(linea(), condiciones=Condiciones(flete=Monto(literal="a convenir", valor="")))
    costo = calcular_costo_real(e)
    assert not costo.completo and costo.total is None and costo.indeterminados == ("Flete o traslado",)
    assert costo.suma_parcial == Decimal("1000")  # lo conocido se sigue mostrando, pero no es el total


def test_costo_flete_que_no_consta_no_aparece():
    assert [p.concepto for p in calcular_costo_real(prop(linea())).pasos] == ["Monto base"]


def test_costo_no_duplica_flete_ya_incluido_como_linea():
    e = prop(linea(total="1000"), linea("flete", total="80"), condiciones=Condiciones(flete=m("80")))
    costo = calcular_costo_real(e)
    assert costo.total == Decimal("1080")
    assert any("ya incluido" in p.detalle for p in costo.pasos)


def test_costo_no_duplica_impuestos_ya_incluidos_en_el_total():
    e = prop(linea(total="1160"), totales=Totales(subtotal=m("1160"), impuestos=[m("160")], total=m("1160")))
    costo = calcular_costo_real(e)
    assert costo.total == Decimal("1160")


def test_costo_linea_ilegible_deja_la_base_indeterminada():
    e = prop(Linea(descripcion="x", categoria="x", cantidad=m("1"), precio_unitario=m("a"), total_linea=m("a")))
    assert calcular_costo_real(e).total is None


def test_costo_usa_decimal_sin_error_de_flotante():
    e = prop(linea(total="0.1"), condiciones=Condiciones(flete=m("0.2")))
    assert calcular_costo_real(e).total == Decimal("0.3")


def test_convertir_costo_a_otra_moneda_con_tasa_trazable():
    c = convertir_costo(calcular_costo_real(prop(linea(total="100"))), "VES", [tasa()])
    assert c.total == Decimal("3650.00") and c.tasas[0].fuente == "BCV"


def test_convertir_costo_incompleto_no_inventa_total():
    e = prop(linea(), condiciones=Condiciones(flete=Monto(literal="a convenir", valor="")))
    assert convertir_costo(calcular_costo_real(e), "VES", [tasa()]).total is None


def test_convertir_sin_tasa_falla_explicitamente():
    with pytest.raises(TasaNoDisponible):
        convertir_costo(calcular_costo_real(prop(linea())), "EUR", [tasa()])


# ------------------------------------------------------------------ moneda
def test_conversion_inversa_y_misma_moneda():
    assert convertir(Decimal("3650"), "VES", "USD", [tasa()]) == (Decimal("100.00"), (tasa(),))
    assert convertir(Decimal("5"), "USD", "USD", []) == (Decimal("5"), ())


def test_conversion_via_bolivar_cuando_no_hay_tasa_directa():
    eur = tasa("EUR", "VES", "40.00")
    monto, usadas = convertir(Decimal("10"), "EUR", "USD", [tasa(), eur])
    assert monto == Decimal("10.96") and len(usadas) == 2  # 10*40/36.5


def test_conversion_usa_la_tasa_mas_reciente():
    vieja, nueva = tasa(valor="30", dia=1), tasa(valor="40", dia=5)
    assert convertir(Decimal("1"), "USD", "VES", [vieja, nueva])[0] == Decimal("40.00")


@pytest.mark.parametrize(
    "kw",
    [
        {"valor": Decimal(0)},
        {"valor": Decimal("-1")},
        {"valor": Decimal("NaN")},
        {"fuente": "  "},
        {"a": "USD"},
        {"de": "dolar"},
    ],
)
def test_tasa_invalida_se_rechaza(kw):
    base = {
        "de": "USD",
        "a": "VES",
        "valor": Decimal("36"),
        "fuente": "BCV",
        "fecha": date(2026, 11, 1),
        "origen": OrigenDeTasa.MANUAL,
    }
    with pytest.raises(DatoInvalido):
        TasaDeCambio(**(base | kw))


# ------------------------------------------------------------------ rúbrica
def crit(p, ev="cita") -> PuntajeCriterio:
    return PuntajeCriterio(puntaje=p, evidencia=[ev])


def test_puntaje_total_pondera_55_20_25():
    r = RubricaPuntuada(rendimiento=crit(80), proteccion_y_perifericos=crit(50), garantia_y_soporte=crit(40))
    assert puntaje_total(r) == Decimal("64.00")  # 44 + 10 + 10


def test_puntaje_exige_evidencia_si_es_mayor_que_cero_y_rango():
    with pytest.raises(ValidationError):
        PuntajeCriterio(puntaje=10, evidencia=[" "])
    with pytest.raises(ValidationError):
        PuntajeCriterio(puntaje=101, evidencia=["x"])
    assert PuntajeCriterio(puntaje=0).evidencia == []


def test_pesos_deben_sumar_100():
    with pytest.raises(DatoInvalido):
        Pesos(rendimiento=50)


# ------------------------------------------------------------------ ranking
def c(id, v=Veredicto.VALIDA, p="80", costo=None) -> Candidata:
    return Candidata(id, v, Decimal(p) if v is Veredicto.VALIDA else None, Decimal(costo) if costo else None)


def test_ranking_ordena_por_puntaje_fuera_de_la_equivalencia():
    assert ordenar_ranking([c("a", p="70"), c("b", p="90"), c("c", p="80")]) == ("b", "c", "a")


def test_ranking_dentro_de_delta_desempata_por_menor_costo():
    r = ordenar_ranking([c("caro", p="90", costo="500"), c("barato", p="88", costo="300")])
    assert r == ("barato", "caro")


def test_ranking_delta_se_mide_contra_el_lider_del_grupo_sin_cadenas():
    # 90, 88, 86, 84: con δ=3 el grupo del líder (90) es {90, 88}; 86 abre otro grupo con 84.
    cands = [c("a", p="90", costo="9"), c("b", p="88", costo="1"), c("c", p="86", costo="9"), c("d", p="84", costo="1")]
    assert ordenar_ranking(cands) == ("b", "a", "d", "c")


def test_ranking_costo_desconocido_pierde_el_desempate():
    assert ordenar_ranking([c("sin", p="90"), c("con", p="90", costo="999")]) == ("con", "sin")


def test_ranking_validas_primero_luego_pendientes_y_descartadas_sin_repetir():
    cands = [
        c("z", Veredicto.DESCARTADA),
        c("p", Veredicto.PENDIENTE_DE_REVISION),
        c("v", p="10"),
        c("y", Veredicto.DESCARTADA),
    ]
    assert ordenar_ranking(cands) == ("v", "p", "y", "z")


def test_ranking_es_determinista_ante_empates_totales():
    assert ordenar_ranking([c("b", costo="1"), c("a", costo="1")]) == ("a", "b")


def test_ranking_rechaza_repetidos_y_validas_sin_puntaje():
    with pytest.raises(DatoInvalido):
        ordenar_ranking([c("a"), c("a")])
    with pytest.raises(DatoInvalido):
        ordenar_ranking([Candidata("a", Veredicto.VALIDA)])


def test_ranking_delta_cero_solo_agrupa_empates_exactos():
    cands = [c("a", p="90", costo="9"), c("b", p="89", costo="1")]
    assert ordenar_ranking(cands, ParametrosDeRanking(delta=Decimal(0))) == ("a", "b")
