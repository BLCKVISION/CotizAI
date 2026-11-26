"""COMPAT, CAPACIDAD, CALIDAD y ABUSIVO: un caso por causa de descarte y los bordes que no deben descartar."""

from decimal import Decimal

import pytest

from evaluador.domain.errors import InvalidData
from evaluador.domain.evaluation import FindingCode
from evaluador.domain.extraction import Amount, Conditions, Line, ProposalExtraction, Totals
from evaluador.domain.rules.abusive import AbuseParams, MarketReference, validate_abuse
from evaluador.domain.rules.capacity import CapacityParams, validate_capacity
from evaluador.domain.rules.compatibility import validate_compatibility
from evaluador.domain.rules.quality import QualityParams, validate_quality


def m(v: str) -> Amount:
    return Amount(literal=v, value=v)


def line(category="gabinete", description="Equipo", qty="11", price="100", total="1100", **specs) -> Line:
    return Line(
        description=description, category=category, quantity=m(qty), unit_price=m(price),
        line_total=m(total), specs={k: str(v) for k, v in specs.items()},
    )  # fmt: skip


def prop(*lines, currency="USD", **kw) -> ProposalExtraction:
    return ProposalExtraction(currency=currency, lines=list(lines), **kw)


# ------------------------------------------------------------------ COMPAT
def test_compat_different_socket_discards_and_quotes():
    (h,) = validate_compatibility(prop(line(cpu_socket="AM4", board_socket="LGA1700")))
    assert h.code == FindingCode.COMPAT and h.discards and "AM4" in h.reason and "LGA1700" in h.reason


def test_compat_ignores_format_and_case():
    assert validate_compatibility(prop(line(cpu_socket="lga 1700", board_socket="LGA-1700"))) == []
    assert validate_compatibility(prop(line(ram_type="DDR4-3200", board_ram_type="ddr4"))) == []


def test_compat_ddr5_ram_on_ddr4_board_discards():
    (h,) = validate_compatibility(prop(line(ram_type="DDR5-5600", board_ram_type="DDR4")))
    assert h.discards and h.code == FindingCode.COMPAT


def test_compat_sodimm_format_in_dimm_slot_discards():
    (h,) = validate_compatibility(prop(line(ram_format="SO-DIMM", board_ram_format="DIMM")))
    assert h.discards


def test_compat_gpu_longer_than_case_discards():
    (h,) = validate_compatibility(prop(line(gpu_length_mm="320 mm", max_gpu_mm="300")))
    assert h.discards and "320" in h.reason and "300" in h.reason


def test_compat_gpu_that_fits_exactly_does_not_discard():
    assert validate_compatibility(prop(line(gpu_length_mm="300", max_gpu_mm="300"))) == []


def test_compat_missing_half_asks_review_and_does_not_discard():
    (h,) = validate_compatibility(prop(line(cpu_socket="AM4")))
    assert h.code == FindingCode.LECTURA and not h.discards and "board_socket" in h.reason


def test_compat_uninterpretable_value_does_not_discard():
    (h,) = validate_compatibility(prop(line(ram_type="rápida", board_ram_type="DDR4")))
    assert h.code == FindingCode.LECTURA and not h.discards


def test_compat_does_not_cross_lines_of_different_devices():
    a = line(cpu_socket="AM4", board_socket="AM4")
    b = line(cpu_socket="LGA1700", board_socket="LGA1700")
    assert validate_compatibility(prop(a, b)) == []


def test_compat_reason_bounds_document_values():
    length = "X" * 500
    (h,) = validate_compatibility(prop(line(cpu_socket=length, board_socket="AM4")))
    assert len(h.reason) < 200


# ------------------------------------------------------------------ CAPACIDAD
def device(**kw):
    return line("gabinete", cpu_tdp_w="65", **kw)  # consumo = 65 + 0 + 100 base = 165 W; con margen 1.25 -> 206,25 W


def test_capacity_insufficient_psu_discards():
    (h,) = validate_capacity(prop(device(psu_power_w="200 W")))
    assert h.code == FindingCode.CAPACIDAD and h.discards and "206" in h.reason


def test_capacity_sufficient_psu_with_margin_does_not_discard():
    assert validate_capacity(prop(device(psu_power_w="450"))) == []


def test_capacity_includes_gpu_in_consumption():
    (h,) = validate_capacity(prop(device(psu_power_w="300", gpu_tdp_w="200")))
    assert h.discards  # 65+200+100 = 365 W * 1.25


def test_capacity_psu_without_tdp_for_any_device_asks_review():
    (h,) = validate_capacity(prop(line(psu_power_w="500")))
    assert h.code == FindingCode.LECTURA and not h.discards


def test_capacity_unreadable_psu_asks_review():
    (h,) = validate_capacity(prop(device(psu_power_w="buena")))
    assert h.code == FindingCode.LECTURA and not h.discards


def test_capacity_ups_in_va_without_watts_is_not_enough():
    ups = line("ups", qty="11", ups_power_va="1000")
    (h,) = validate_capacity(prop(device(), ups))
    assert h.code == FindingCode.LECTURA and not h.discards and "VA" in h.reason


def test_capacity_one_ups_per_device_is_sufficient():
    ups = line("ups", qty="11", ups_power_w="600")  # (165+40)*1*1.25 = 256,25
    assert validate_capacity(prop(device(), ups)) == []


def test_capacity_single_ups_for_the_whole_lab_is_insufficient():
    ups = line("ups", qty="1", ups_power_w="1500")  # (165+40)*11*1.25 = 2818,75
    (h,) = validate_capacity(prop(device(), ups))
    assert h.discards and "11 equipo" in h.reason


def test_capacity_distributes_devices_among_ups_rounding_up():
    ups = line("ups", qty="4", ups_power_w="800")  # ceil(11/4)=3 -> 205*3*1.25 = 768,75
    assert validate_capacity(prop(device(), ups)) == []
    weak = line("ups", qty="4", ups_power_w="700")
    assert validate_capacity(prop(device(), weak))[0].discards


def test_capacity_invalid_params_are_rejected():
    with pytest.raises(InvalidData):
        CapacityParams(margin=Decimal("0.9"))


# ------------------------------------------------------------------ CALIDAD
@pytest.mark.parametrize("text", ["Laptop reacondicionada", "Monitor refurbished", "Gabinete second-hand", "Open box"])
def test_quality_non_new_condition_discards(text):
    (h,) = validate_quality(prop(line(description=text)))
    assert h.code == FindingCode.CALIDAD and h.discards


def test_quality_condition_in_specs():
    (h,) = validate_quality(prop(line(condition="reciclado")))
    assert h.discards


def test_quality_negation_does_not_discard():
    assert validate_quality(prop(line(description="Equipo nuevo, no reacondicionado, sin usar"))) == []


def test_quality_new_does_not_discard():
    assert validate_quality(prop(line(condition="nuevo"))) == []


def test_quality_proposal_note_counts():
    (h,) = validate_quality(prop(line(), literal_notes=["Los monitores son reacondicionados de fábrica"]))
    assert h.discards


def test_quality_obsolete_by_year():
    (h,) = validate_quality(prop(line(release_year="2012")))
    assert h.discards and "2012" in h.reason
    assert validate_quality(prop(line(release_year="2018"))) == []


def test_quality_unreadable_year_asks_review():
    (h,) = validate_quality(prop(line(release_year="viejo")))
    assert h.code == FindingCode.LECTURA and not h.discards


def test_quality_ddr3_ram_obsolete_and_configurable():
    assert validate_quality(prop(line(ram_type="DDR3-1600")))[0].discards
    assert validate_quality(prop(line(ram_type="DDR3")), QualityParams(obsolete_ram_types=frozenset())) == []


# ------------------------------------------------------------------ ABUSIVO
def test_abuse_overprice_with_two_sources_discards():
    refs = {1: MarketReference(Decimal("100"), "USD", sources=2)}
    (h,) = validate_abuse(prop(line(price="200")), refs)
    assert h.code == FindingCode.ABUSIVO and h.discards


def test_abuse_single_source_is_not_enough_to_discard():
    refs = {1: MarketReference(Decimal("100"), "USD", sources=1)}
    (h,) = validate_abuse(prop(line(price="200")), refs)
    assert h.code == FindingCode.ABUSIVO and not h.discards and "sola fuente" in h.reason


def test_abuse_price_within_threshold_does_not_discard():
    refs = {1: MarketReference(Decimal("100"), "USD", sources=3)}
    assert validate_abuse(prop(line(price="130")), refs) == []  # justo en 30 %
    assert validate_abuse(prop(line(price="130.01")), refs)[0].discards


def test_abuse_configurable_threshold():
    refs = {1: MarketReference(Decimal("100"), "USD", sources=2)}
    assert validate_abuse(prop(line(price="150")), refs, AbuseParams(overprice_threshold=Decimal("0.6"))) == []


def test_abuse_different_currency_asks_for_conversion_instead_of_comparing():
    refs = {1: MarketReference(Decimal("100"), "VES", sources=3)}
    (h,) = validate_abuse(prop(line(price="999")), refs)
    assert h.code == FindingCode.LECTURA and not h.discards


def test_abuse_reference_to_nonexistent_line_is_error():
    with pytest.raises(InvalidData):
        validate_abuse(prop(line()), {5: MarketReference(Decimal("1"), "USD", 2)})


def test_abuse_excessive_freight_discards():
    e = prop(line(total="1000"), conditions=Conditions(freight=m("300")))
    (h,) = validate_abuse(e)
    assert h.discards and "Flete" in h.reason


def test_abuse_reasonable_or_amountless_freight_does_not_discard():
    assert validate_abuse(prop(line(total="1000"), conditions=Conditions(freight=m("100")))) == []
    assert (
        validate_abuse(prop(line(total="1000"), conditions=Conditions(freight=Amount(literal="a convenir", value=""))))
        == []
    )


def test_abuse_uses_declared_subtotal_as_base():
    e = prop(line(total="1000"), totals=Totals(subtotal=m("5000")), conditions=Conditions(freight=m("300")))
    assert validate_abuse(e) == []


@pytest.mark.parametrize(
    "warranty",
    [
        "Garantía válida únicamente en el exterior del país",
        "La garantía se hará efectiva solo en el extranjero.",
        "Garantía exclusivamente fuera del país",
    ],
)
def test_abuse_warranty_only_abroad(warranty):
    (h,) = validate_abuse(prop(line(), conditions=Conditions(warranty=warranty)))
    assert h.discards and "exterior" in h.reason


def test_abuse_local_warranty_does_not_discard():
    assert validate_abuse(prop(line(), conditions=Conditions(warranty="Garantía de 3 años en el país"))) == []


def test_abuse_trial_that_is_charged_later():
    (h,) = validate_abuse(prop(line(), literal_notes=["La prueba de funcionamiento se cobra aparte"]))
    assert h.discards and "Prueba" in h.reason
