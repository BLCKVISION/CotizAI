"""Each wrong verdict found on the practice quotes, reduced to the smallest case that reproduces it."""

from __future__ import annotations

import pytest

from evaluador.domain.costo import calcular_costo_real
from evaluador.domain.document_text import exclusions, has_priced_line
from evaluador.domain.extraccion import ComponentEvidence, ExtraccionPropuesta, Linea, Monto
from evaluador.domain.normalisation import normalise
from evaluador.domain.reglas.abusivo import validar_abuso
from evaluador.domain.reglas.alcance import quoted_components, unlisted_components, validar_alcance_fijo
from evaluador.domain.reglas.aritmetica import validar_aritmetica
from evaluador.domain.reglas.calidad import validar_calidad
from evaluador.domain.reglas.compatibilidad import validar_compatibilidad


def m(value, literal=None) -> Monto:
    return Monto(literal=literal or str(value), valor=str(value))


def line(description, category="otro", qty=None, price=None, total=None, specs=None, quote="") -> Linea:
    return Linea(descripcion=description, categoria=category, cantidad=None if qty is None else m(qty),
                 precio_unitario=None if price is None else m(price), total_linea=None if total is None else m(total),
                 especificaciones=specs or {}, evidencia={"texto": quote or description})  # fmt: skip


def quote(*lines, **fields) -> ExtraccionPropuesta:
    return ExtraccionPropuesta(moneda="USD", lineas=list(lines), **fields)


def codes(findings, discards=True) -> set[str]:
    return {h.codigo.value for h in findings if h.descarta == discards}


STATIONS = [line("PC Estudiante", "Computadora", 10, 1000, 10000), line("PC Docente", "Computadora", 1, 1500, 1500)]
FULL = "Monitor 24, Teclado, Ratón y Regulador AVR"


# ---------- totals the model invented ----------
def test_a_subtotal_that_is_not_printed_is_ignored():
    e = quote(*STATIONS, totales={"subtotal": m(11000), "impuestos": [m("1760")], "total": m("12760")})
    clean = normalise(e, "PC 10 x 1000 = 10000, docente 1500. TOTAL 11500")
    assert (clean.totales.subtotal, clean.totales.total, clean.totales.impuestos) == (None, None, [])
    assert validar_aritmetica(clean) == []


def test_a_printed_wrong_total_still_discards():
    e = quote(*STATIONS, totales={"total": m("12000", "12.000,00")})
    assert codes(validar_aritmetica(normalise(e, "10000 1500 1000 TOTAL 12.000,00"))) == {"ARITMETICA"}


def test_a_formula_without_stored_result_is_computed_by_code():
    item = line("PC", "Computadora", 10, 1750, total=None)
    item = item.model_copy(update={"total_linea": m(99999, "=C8*D8")})
    assert str(normalise(quote(item), "10 1750 =C8*D8").lineas[0].total_linea.valor) == "17500"


# ---------- chat quotes ----------
def test_included_lines_and_single_charges_are_not_unreadable():
    chat = quote(*[line(s.descripcion, s.categoria, int(s.cantidad.valor), s.precio_unitario.valor) for s in STATIONS],
                 line("Periféricos: " + FULL), line("Envío", total=160),
                 totales={"total": m(11660)})  # fmt: skip
    clean = normalise(chat, "10 1000 1 1500 160 11660")
    assert validar_aritmetica(clean) == [] and calcular_costo_real(clean).total == 11660


def test_a_product_without_quantity_still_asks_for_review():
    assert codes(validar_aritmetica(quote(line("Monitor", total=100))), discards=False) == {"LECTURA"}


def test_a_surcharge_for_paying_in_bolivares_does_not_raise_a_dollar_quote():
    e = quote(*STATIONS, condiciones={"recargos": [{"concepto": "Pago en Bs. a tasa BCV", "porcentaje": m(4)}]})
    assert normalise(e, "10000 1500 4").condiciones.recargos == []


def test_a_yearly_licence_may_stay_out_of_the_printed_total():
    licence = line("Software, licencia anual", qty=1, price=6600, total=6600)
    assert validar_aritmetica(quote(*STATIONS, licence, totales={"total": m(11500)})) == []


def test_installation_quoted_apart_is_not_added_twice():
    priced = line("Instalación y puesta en marcha", "Servicios", 1, 300, 300)
    assert has_priced_line(quote(priced), "instalacion")


# ---------- scope ----------
def test_components_are_read_from_the_text_whatever_the_category_says():
    e = quote(*STATIONS, line("Monitor 24 FHD", "Periféricos", 11), line("Teclado y Ratón USB", "Periféricos", 11),
              line("UPS 600VA + Protector", "Accesorios", 11))  # fmt: skip
    assert validar_alcance_fijo(e) == []


def test_peripherals_listed_once_per_station_are_covered():
    assert validar_alcance_fijo(quote(*STATIONS, line("Periféricos: " + FULL))) == []


def test_fewer_units_than_stations_is_incomplete():
    e = quote(*STATIONS, line("Monitor", qty=10), line("Teclado, Ratón, Protector", qty=11))
    assert codes(validar_alcance_fijo(e)) == {"ALCANCE"}


@pytest.mark.parametrize(
    "text",
    ["Se entregan en cajas selladas, no incluye protectores\neléctricos ni instalación.",
     "Delivered in sealed boxes. Does not include electrical protectors or on-site installation."],
)  # fmt: skip
def test_what_the_quote_says_it_leaves_out_discards_it(text):
    (finding,) = [h for h in validar_alcance_fijo(quote(*STATIONS, line(FULL)), document=text) if h.descarta]
    assert "instalación" in finding.motivo and "protector" in finding.motivo


def test_leaving_out_something_not_required_does_not_discard():
    assert exclusions("No incluye obras civiles.")
    assert validar_alcance_fijo(quote(*STATIONS, line(FULL)), document="No incluye obras civiles.") == []


def test_a_component_named_only_by_model_needs_a_quote_found_in_the_document():
    e = quote(*STATIONS, line("Periféricos: LG 24MP400-B | Redragon K509 + M601 | UPS APC"))
    assert unlisted_components(e) == ["monitor", "teclado", "raton"]
    document = "Periféricos: LG 24MP400-B | Redragon K509 + M601 | UPS APC"
    answer = ComponentEvidence(found=[{"component": "monitor", "quote": "LG 24MP400-B"},
                                      {"component": "teclado", "quote": "Redragon K509"},
                                      {"component": "raton", "quote": "Mouse inventado"}])  # fmt: skip
    assert quoted_components(answer, unlisted_components(e), document) == {"monitor", "teclado"}


def test_a_free_set_of_peripherals_counted_as_one_is_one_per_station():
    included = line("Periféricos: " + FULL, qty=1, price=0, total=0)
    assert validar_alcance_fijo(quote(*STATIONS, included)) == []
    priced = line("Periféricos: " + FULL, qty=1, price=200, total=200)
    assert codes(validar_alcance_fijo(quote(*STATIONS, priced))) == {"ALCANCE"}


# ---------- compatibility ----------
def station(description="", specs=None, evidence=""):
    return quote(line(description, "Computadora", specs=specs, quote=evidence or description))


@pytest.mark.parametrize(
    "extraction",
    [
        station("PC AMD Ryzen 7 7700X (AM5), Board ASUS B760M (LGA1700), 32GB DDR4, SSD 1TB"),
        station(evidence="CPU: Core i5-14400F | RAM 32 GB DDR5 5600 MHz\nPlaca: Asus PRIME B760M-A D4 (DDR4)"),
        station(specs={"RAM": "64GB (DDR4 3200MHz (4x16GB))",
                       "Expansión": "ASUS PRIME H610M-K D4 (2xDIMM, máx. 32GB / 2 slots)"}),
    ],
)  # fmt: skip
def test_incompatible_parts_from_the_practice_quotes(extraction):
    assert codes(validar_compatibilidad(extraction)) == {"COMPAT"}


@pytest.mark.parametrize(
    "specs",
    [
        {"RAM": "32GB (DDR5 5600MHz (2x16GB, 2 slots libres))", "Expansión": "B650M Pro, 4xDIMM, 2xM.2"},
        {"RAM": "16GB (DDR5 (1x16GB, 3 slots libres))", "Expansión": "B650M, 4xDIMM"},
        {"RAM": "32GB DDR4", "Placa": "B760M compatible DDR4 / DDR5"},
        {"CPU": "Ryzen 5 7600 (AM5)", "Disipador": "AM4 / AM5"},
    ],
)
def test_compatible_parts_add_nothing(specs):
    assert validar_compatibilidad(station(specs=specs)) == []


# ---------- quality and abusive terms ----------
@pytest.mark.parametrize("description", ["Intel Xeon E5-2680 v4 (14C/28T)", "PC Intel Core i7-6700 (6ta Gen)",
                                         "Workstation, Arquitectura 2016"])  # fmt: skip
def test_old_processors_are_obsolete(description):
    assert codes(validar_calidad(station(description))) == {"CALIDAD"}


@pytest.mark.parametrize("description", ["Krypton Studio i7-4070 (Intel Core i7-13700F)", "PC Intel i5-13400",
                                         "Core i7-14700K con 32GB DDR5"])  # fmt: skip
def test_current_processors_and_product_names_are_not(description):
    assert validar_calidad(station(description)) == []


@pytest.mark.parametrize(
    "text",
    ["Garantía solo en Miami, USA (envío por cuenta del comprador).",
     "Incluye software de prueba de 30 días, luego $45/mes obligatorio por PC.",
     "Windows 11 Pro (Evaluación) (Preinstalado sin costo inicial; requiere compra de licencias\nal vencer 30 días)"],
)  # fmt: skip
def test_abusive_terms_are_read_from_the_document(text):
    assert codes(validar_abuso(quote(*STATIONS), document=text)) == {"ABUSIVO"}


@pytest.mark.parametrize("text", ["Garantía local de 12 meses en Caracas.", "Ubuntu 24.04, licencia anual: $0.00.",
                                  "Periodo de prueba sin costo.", "Evaluación del comité. Instalación obligatoria.",
                                  "Equipo de prueba en sitio. Luego se instala; garantía de 12 meses."])  # fmt: skip
def test_honest_terms_are_not_abusive(text):
    assert validar_abuso(quote(*STATIONS), document=text) == []


def test_hidden_text_is_not_read_as_a_condition():
    hidden = "Oferta\n[OCULTO] [p.1]: garantía solo en el exterior"
    assert validar_abuso(quote(*STATIONS), document=hidden) == []
