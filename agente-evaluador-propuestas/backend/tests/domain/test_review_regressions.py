"""Regresiones de la revisión de código de las reglas #9 a #14: cada caso reproduce un fallo real confirmado.

Criterio común: ante un dato ambiguo o ilegible NO se descarta (se pide revisión); descartar mal a un proveedor
es el peor fallo posible en una licitación.
"""

from datetime import date
from decimal import Decimal

import pytest
from pydantic import ValidationError

from evaluador.domain import specs as spec
from evaluador.domain.cost import compute_real_cost, convert_cost
from evaluador.domain.currency import ExchangeRate, RateOrigin
from evaluador.domain.errors import InvalidData, RateUnavailable
from evaluador.domain.evaluation import FindingCode, Verdict
from evaluador.domain.extraction import Amount, Conditions, Line, ProposalExtraction, Surcharge, Totals
from evaluador.domain.ranking import Candidate, RankingParams
from evaluador.domain.rules.abusive import MarketReference, validate_abuse
from evaluador.domain.rules.capacity import validate_capacity
from evaluador.domain.rules.compatibility import validate_compatibility
from evaluador.domain.rules.quality import validate_quality
from evaluador.domain.score import CriterionScore, ScoredRubric, Weights


def m(v: str) -> Amount:
    return Amount(literal=v, value=v)


def line(category="gabinete", description="Equipo", qty="11", total="1100", **specs) -> Line:
    return Line(
        description=description, category=category, quantity=m(qty), unit_price=m("100"),
        line_total=m(total), specs={k: str(v) for k, v in specs.items()},
    )  # fmt: skip


def prop(*lines, currency="USD", **kw) -> ProposalExtraction:
    return ProposalExtraction(currency=currency, lines=list(lines), **kw)


def only_review(findings) -> bool:
    return len(findings) == 1 and findings[0].code == FindingCode.LECTURA and not findings[0].discards


# ---------------------------------------------------------------- lectura de medidas
@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("650 W", 650),
        ("650W", 650),
        ("1.200 W", 1200),
        ("1,200 W", 1200),
        ("1.5 kW", 1500),
        ("0.500 W", Decimal("0.5")),
    ],
)
def test_read_measure_accepts_complete_formats(text, expected):
    assert spec.read_measure(text, spec.WATTS) == Decimal(expected)


@pytest.mark.parametrize(
    "text", ["2 x 500 W", "1500VA/900W", "Max-330mm", "450W (80+)", "-300 W", "12 parsecs", "", "N/D"]
)
def test_read_measure_rejects_ambiguity_instead_of_guessing(text):
    assert spec.read_measure(text, spec.WATTS) is None


def test_read_measure_converts_units():
    assert spec.read_measure("30 cm", spec.MILLIMETERS) == Decimal(300)
    assert spec.read_measure("1.200 mm", spec.MILLIMETERS) == Decimal(1200)


# ---------------------------------------------------------------- COMPAT
@pytest.mark.parametrize(
    ("cpu", "board"),
    [
        ("Socket LGA1700", "LGA1700"),
        ("AM5 (Ryzen 7000)", "AM5"),
        ("LGA 1700 (12th gen)", "Socket LGA-1700"),
        ("Socket AM4", "am4"),
    ],
)
def test_compat_socket_with_extra_words_is_not_incompatible(cpu, board):
    assert validate_compatibility(prop(line(cpu_socket=cpu, board_socket=board))) == []


def test_compat_truly_different_sockets_still_discard():
    (h,) = validate_compatibility(prop(line(cpu_socket="Socket AM4", board_socket="LGA 1700 (12th gen)")))
    assert h.discards


def test_compat_board_supporting_two_generations_asks_review():
    assert only_review(validate_compatibility(prop(line(ram_type="DDR5", board_ram_type="DDR4/DDR5"))))
    assert only_review(validate_compatibility(prop(line(ram_type="DDR4", board_ram_type="DDR5 (compatible DDR4)"))))


def test_compat_soldered_lpddr_does_not_pass_as_slot_ddr():
    assert only_review(validate_compatibility(prop(line(ram_type="LPDDR4", board_ram_type="DDR4"))))


def test_compat_hyphen_in_measure_is_not_read_as_negative_sign():
    assert only_review(validate_compatibility(prop(line(gpu_length_mm="300 mm", max_gpu_mm="Max-330mm"))))


def test_compat_respects_card_unit():
    (h,) = validate_compatibility(prop(line(gpu_length_mm="35 cm", max_gpu_mm="320 mm")))
    assert h.discards
    assert validate_compatibility(prop(line(gpu_length_mm="30 cm", max_gpu_mm="320 mm"))) == []


def test_compat_rdimm_does_not_fit_desktop_dimm_board():
    (h,) = validate_compatibility(prop(line(ram_format="RDIMM", board_ram_format="DIMM")))
    assert h.discards
    assert validate_compatibility(prop(line(ram_format="UDIMM", board_ram_format="DIMM"))) == []


# ---------------------------------------------------------------- CAPACIDAD
def device(**kw):
    return line("gabinete", cpu_tdp_w="65", **kw)


def test_capacity_psu_over_a_thousand_watts_is_not_read_as_1_2_w():
    assert validate_capacity(prop(device(psu_power_w="1.200 W"))) == []
    assert validate_capacity(prop(device(psu_power_w="1,200 W"))) == []


@pytest.mark.parametrize("text", ["2 x 500 W", "650W (80+ Bronze)"])
def test_capacity_ambiguous_power_asks_review_does_not_discard(text):
    assert only_review(validate_capacity(prop(device(psu_power_w=text))))


def test_capacity_ups_with_va_and_watts_together_does_not_pass_as_watts():
    ups = line("ups", qty="11", ups_power_w="1500VA/900W")
    assert only_review(validate_capacity(prop(device(), ups)))


@pytest.mark.parametrize("gpu", ["N/D", "RTX 4090 450W"])
def test_capacity_unreadable_gpu_tdp_does_not_count_as_zero(gpu):
    hs = validate_capacity(prop(device(psu_power_w="250", gpu_tdp_w=gpu)))
    assert hs and all(h.code == FindingCode.LECTURA and not h.discards for h in hs)


def test_capacity_fractional_ups_quantity_asks_review():
    ups = line("ups", qty="0.5", ups_power_w="900")
    assert only_review(validate_capacity(prop(device(), ups)))


# ---------------------------------------------------------------- CALIDAD
@pytest.mark.parametrize(
    "text", ["Procesador Intel Core de segunda generación", "Licencia renovada por 3 años", "Empaque reciclado 100 %"]
)
def test_quality_ambiguous_or_foreign_terms_do_not_discard(text):
    hs = validate_quality(prop(line(description=text)))
    assert all(not h.discards for h in hs)  # a lo sumo pide revisión


def test_quality_used_in_condition_field_discards_but_in_free_text_only_reviews():
    assert validate_quality(prop(line(condition="usado")))[0].discards
    assert only_review(validate_quality(prop(line(description="Monitor USADO"))))


@pytest.mark.parametrize(
    "text",
    ["No ha sido usado", "nunca ha sido usado", "No fue reacondicionado", "Nuevo, jamás usado", "sin ser usado"],
)
def test_quality_full_phrase_negations_do_not_discard(text):
    assert validate_quality(prop(line(description=text))) == []


@pytest.mark.parametrize(
    "text", ["Refurbished unit", "second-hand laptop", "pre-owned", "Reacondicionádo", "Seminuevo", "RECONDICIONADO"]
)
def test_quality_unambiguous_terms_in_other_languages_and_accents_discard(text):
    assert validate_quality(prop(line(description=text)))[0].discards


def test_quality_negation_does_not_cross_commas():
    assert validate_quality(prop(line(description="no nuevo, reacondicionado")))[0].discards


@pytest.mark.parametrize("year", ["2016-2019", "2015/2019", "Q3 2012 o 2020"])
def test_quality_year_ranges_are_ambiguous_and_ask_review(year):
    assert only_review(validate_quality(prop(line(release_year=year))))


def test_quality_full_date_uses_the_single_year():
    assert validate_quality(prop(line(release_year="12/05/2012")))[0].discards
    assert validate_quality(prop(line(release_year="12/05/2022"))) == []


# ---------------------------------------------------------------- ABUSIVO
@pytest.mark.parametrize(
    "note",
    [
        "Prueba gratuita, no tiene costo",
        "Diagnóstico gratis; no se cobra",
        "Test: no se cobra",
        "prueba piloto, con costo cero",
        "evaluación de riesgos facturada mensual",
    ],
)
def test_abuse_free_or_negated_trials_do_not_discard(note):
    assert validate_abuse(prop(line(), literal_notes=[note])) == []


@pytest.mark.parametrize(
    "warranty",
    ["Garantía válida únicamente fuera de Venezuela", "Warranty valid only abroad", "Garantía solo en el extranjero"],
)
def test_abuse_warranty_abroad_in_more_forms(warranty):
    assert validate_abuse(prop(line(), conditions=Conditions(warranty=warranty)))[0].discards


def test_abuse_domestic_warranty_with_process_from_abroad_does_not_discard():
    assert (
        validate_abuse(
            prop(line(), conditions=Conditions(warranty="Garantía: nacional; solo tramitada desde el exterior"))
        )
        == []
    )


def test_abuse_proposal_without_currency_does_not_compare_blindly():
    refs = {1: MarketReference(Decimal("1"), "USD", sources=3)}
    assert only_review(validate_abuse(prop(line(), currency=None), refs))


def test_abuse_threshold_is_shown_without_misleading_rounding():
    from evaluador.domain.rules.abusive import AbuseParams

    refs = {1: MarketReference(Decimal("100"), "USD", sources=2)}
    expensive = Line(description="x", category="x", quantity=m("1"), unit_price=m("200"), line_total=m("200"))
    (h,) = validate_abuse(prop(expensive), refs, AbuseParams(overprice_threshold=Decimal("0.125")))
    assert "12.5 %" in h.reason  # antes decía «12 %» por redondear la mitad hacia el par


# ---------------------------------------------------------------- costo real
def test_cost_without_lines_or_subtotal_has_no_base_and_is_not_zero():
    cost = compute_real_cost(prop(totals=Totals(taxes=[m("16")])))
    assert cost.total is None and "Monto base" in cost.undetermined


def test_cost_included_taxes_with_freight_are_not_duplicated():
    e = prop(
        line(total="100"),
        totals=Totals(subtotal=m("100"), taxes=[m("16")], total=m("110")),
        conditions=Conditions(freight=m("10")),
    )
    assert compute_real_cost(e).total == Decimal("110")


def test_cost_declared_total_with_unitemized_tax_is_not_silently_ignored():
    e = prop(line(total="100"), totals=Totals(subtotal=m("100"), total=m("116")))
    cost = compute_real_cost(e)
    assert cost.total is None and "Diferencia sin explicar frente al total declarado" in cost.undetermined


def test_cost_declared_total_that_adds_up_with_separate_freight_is_complete():
    e = prop(
        line(total="100"), totals=Totals(subtotal=m("100"), total=m("100")), conditions=Conditions(freight=m("10"))
    )
    assert compute_real_cost(e).total == Decimal("110")


@pytest.mark.parametrize("where", ["freight", "surcharge", "tax"])
def test_cost_negative_amounts_are_undetermined_not_discounts(where):
    cond = {
        "freight": Conditions(freight=m("-500")),
        "surcharge": Conditions(surcharges=[Surcharge(item="x", amount=m("-5"))]),
    }.get(where, Conditions())
    total = Totals(taxes=[m("-16")]) if where == "tax" else Totals()
    cost = compute_real_cost(prop(line(total="100"), conditions=cond, totals=total))
    assert cost.total is None and not cost.complete


def test_cost_lowercase_or_padded_currency_is_normalized():
    cost = compute_real_cost(prop(line(total="100"), currency=" usd "))
    assert cost.currency == "USD"
    assert convert_cost(cost, "USD", []).total == Decimal("100")
    with pytest.raises(RateUnavailable):
        convert_cost(cost, "EUR", [])


def test_rate_with_invisible_source_is_rejected():
    with pytest.raises(InvalidData):
        ExchangeRate("USD", "VES", Decimal("36"), "​ ​", date(2026, 11, 1), RateOrigin.MANUAL)


# ---------------------------------------------------------------- ranking y rúbrica
@pytest.mark.parametrize("score", [Decimal("NaN"), Decimal("Infinity"), Decimal("-1"), Decimal(500), 90.5, 90])
def test_valid_candidate_rejects_impossible_scores(score):
    with pytest.raises(InvalidData):
        Candidate("a", Verdict.VALID, score)


@pytest.mark.parametrize("cost", [Decimal("NaN"), Decimal("-5"), 10.5])
def test_candidate_rejects_impossible_costs(cost):
    with pytest.raises(InvalidData):
        Candidate("a", Verdict.VALID, Decimal(80), cost)


def test_delta_must_be_decimal():
    with pytest.raises(InvalidData):
        RankingParams(delta=3)  # type: ignore[arg-type]


@pytest.mark.parametrize("score", [True, "80", 80.0, 80.5])
def test_rubric_score_is_strict(score):
    with pytest.raises(ValidationError):
        CriterionScore(score=score, evidence=["quote"])


def test_rubric_rejects_misspelled_fields_and_cleans_evidence():
    with pytest.raises(ValidationError):
        CriterionScore(score=1)  # type: ignore[call-arg]
    assert CriterionScore(score=0, evidence=[" ", " cita "]).evidence == ["cita"]
    ok = {"score": 10, "evidence": ["x"]}
    with pytest.raises(ValidationError):
        ScoredRubric.model_validate(
            {"performance": ok, "protection_and_peripherals": ok, "warranty_and_support": ok, "extra": 1}
        )


@pytest.mark.parametrize("weights", [(True, True, 98), (55.0, 20.0, 25.0), (50.5, 24.5, 25)])
def test_weights_only_real_integers(weights):
    with pytest.raises(InvalidData):
        Weights(*weights)
