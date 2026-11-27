"""One reproduction for each problem found by the code review."""

from __future__ import annotations

from decimal import Decimal

from evaluador.domain.costo import calcular_costo_real
from evaluador.domain.document_text import exclusions, without_exclusions
from evaluador.domain.extraccion import Condiciones, Recargo
from evaluador.domain.normalisation import normalise
from evaluador.domain.reglas.alcance import validar_alcance_fijo
from evaluador.domain.reglas.aritmetica import validar_aritmetica
from tests.domain.test_real_quote_regressions import codes, line, m, quote

PARTS = ("monitor", "teclado", "mouse", "protector")


def _stations(*names, qty=(10, 1)):
    return [line(f"{who} {name}", name, units, 10, 10 * units) for name in names
            for who, units in (("Estudiantes", qty[0]), ("Docente", qty[1]))]  # fmt: skip


# ---------- 1: a station name is not a computer ----------
def test_peripherals_without_any_computer_do_not_cover_the_case():
    found = validar_alcance_fijo(quote(*_stations(*PARTS)))
    assert codes(found) == {"ALCANCE"} and "gabinete" in " ".join(h.motivo for h in found)


def test_furniture_for_the_teacher_is_not_a_computer():
    found = validar_alcance_fijo(quote(line("Escritorio para docente", "mueble", 11, 50, 550)))
    assert codes(found) == {"ALCANCE"}


def test_a_station_described_only_by_its_hardware_is_still_a_computer():
    computers = [line("Estudiantes AMD Ryzen 5 7600, 16GB, SSD 1TB", "otro", 10, 900, 9000),
                 line("Docente AMD Ryzen 7 7700, 32GB", "otro", 1, 1200, 1200)]  # fmt: skip
    assert codes(validar_alcance_fijo(quote(*computers, *_stations(*PARTS)))) == set()


# ---------- 2: an exclusion ends with its line ----------
HONEST = "Precios no incluyen IVA\nInstalación y puesta en marcha incluidas\nMonitor y teclado en cada puesto"


def test_an_exclusion_does_not_swallow_the_following_lines():
    assert exclusions(HONEST) == ["no incluyen iva"]
    assert "monitor y teclado" in without_exclusions(HONEST) and "instalacion" in without_exclusions(HONEST)


def test_an_exclusion_that_wraps_or_lists_items_is_still_read():
    assert "monitor" in " ".join(exclusions("El precio no incluye\nmonitor ni teclado."))
    listed = " ".join(exclusions("No incluye:\n- Monitor\n- Instalación\nGarantía de 1 año"))
    assert "monitor" in listed and "instalacion" in listed and "garantia" not in listed
    assert "teclado" in " ".join(exclusions("No se incluye monitor,\nteclado ni ratón"))


# ---------- 3: tax printed only as a percentage ----------
def _taxed(total, text, **totals):
    e = quote(line("PC", "Computadora", 10, 100, 1000), totales={"total": m(total), **totals})
    return normalise(e, f"PC 10 x 100 = 1000. {text} TOTAL {total}")


def test_a_total_with_percentage_tax_is_accepted_and_costed():
    for text in ("IVA 16%.", "Más 16 % de IVA."):
        clean = _taxed(1160, text)
        assert validar_aritmetica(clean) == [], text
        assert calcular_costo_real(clean).total == Decimal("1160.00")
    with_subtotal = _taxed(1160, "Subtotal 1000. IVA (16%)", subtotal=m(1000))
    assert validar_aritmetica(with_subtotal) == []


def test_a_total_the_percentage_does_not_explain_still_discards():
    assert codes(validar_aritmetica(_taxed(1200, "IVA 16%."))) == {"ARITMETICA"}
    assert codes(validar_aritmetica(_taxed(1160, "Descuento 16%."))) == {"ARITMETICA"}


def test_a_surcharge_included_in_the_total_is_not_an_arithmetic_error():
    e = quote(line("PC", "Computadora", 10, 100, 1000), totales={"total": m(1050)},
              condiciones={"recargos": [{"concepto": "Manejo", "porcentaje": m(5)}]})  # fmt: skip
    assert validar_aritmetica(e) == []


# ---------- 4: a note never hides a readable shortage ----------
def test_a_note_does_not_hide_that_monitors_are_missing():
    computers = [line("PC completa", "Computadora", 11, 900, 9900)]
    others = [line(name, name, 11, 10, 110) for name in ("teclado", "mouse", "protector")]
    e = quote(*computers, line("Monitor 24", "monitor", 5, 100, 500), *others,
              notas_literales=["Monitor con garantía de 1 año"])  # fmt: skip
    found = validar_alcance_fijo(e)
    assert codes(found) == {"ALCANCE"} and "monitor" in " ".join(h.motivo for h in found)


# ---------- 7: empty objects in conditions ----------
EMPTY = {"literal": None, "valor": None}


def test_empty_condition_amounts_mean_not_stated():
    c = Condiciones.model_validate({"flete": EMPTY, "instalacion": {"literal": "null", "valor": ""}})
    assert c.flete is None and c.instalacion is None
    surcharge = Recargo.model_validate({"concepto": "IGTF", "monto": EMPTY, "porcentaje": EMPTY})
    assert surcharge.monto is None and surcharge.porcentaje is None


def test_a_charge_to_be_agreed_is_kept_as_undetermined():
    c = Condiciones.model_validate({"flete": {"literal": "a convenir", "valor": None}})
    assert c.flete is not None and (c.flete.literal, c.flete.valor) == ("a convenir", "")
