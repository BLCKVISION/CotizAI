"""Costo real, conversión de moneda, rúbrica y ranking."""

from datetime import date
from decimal import Decimal

import pytest
from pydantic import ValidationError

from evaluador.domain.cost import compute_real_cost, convert_cost
from evaluador.domain.currency import ExchangeRate, RateOrigin, convert
from evaluador.domain.errors import InvalidData, RateUnavailable
from evaluador.domain.evaluation import Verdict
from evaluador.domain.extraction import Amount, Conditions, Line, ProposalExtraction, Surcharge, Totals
from evaluador.domain.ranking import Candidate, RankingParams, sort_ranking
from evaluador.domain.score import CriterionScore, ScoredRubric, Weights, total_score


def m(v: str, literal: str | None = None) -> Amount:
    return Amount(literal=literal or v, value=v)


def line(category="gabinete", total="1000") -> Line:
    return Line(description=category, category=category, quantity=m("1"), unit_price=m(total), line_total=m(total))


def prop(*lines, **kw) -> ProposalExtraction:
    return ProposalExtraction(currency=kw.pop("currency", "USD"), lines=list(lines), **kw)


def rate(base="USD", quote="VES", value="36.50", day=1) -> ExchangeRate:
    return ExchangeRate(base, quote, Decimal(value), "BCV", date(2026, 11, day), RateOrigin.BCV)


# ------------------------------------------------------------------ costo real
def test_cost_sums_base_freight_installation_surcharges_and_taxes():
    e = prop(
        line(total="1000"),
        totals=Totals(subtotal=m("1000"), taxes=[m("160")], total=m("1160")),
        conditions=Conditions(
            freight=m("50"), installation=m("30"), surcharges=[Surcharge(item="Seguro", amount=m("20"))]
        ),
    )
    cost = compute_real_cost(e)
    assert cost.total == Decimal("1260") and cost.complete and cost.currency == "USD"
    assert [p.item for p in cost.steps] == [
        "Monto base",
        "Flete o traslado",
        "Instalación",
        "Recargo: Seguro",
        "Impuesto 1",
    ]


def test_cost_percentage_surcharge_shows_its_base():
    e = prop(line(total="1000"), conditions=Conditions(surcharges=[Surcharge(item="Comisión", percentage=m("2.5"))]))
    step = compute_real_cost(e).steps[1]
    assert step.amount == Decimal("25.00") and "1000" in step.detail and "2.5" in step.detail


def test_cost_without_amount_is_undetermined_and_not_zero():
    e = prop(line(), conditions=Conditions(freight=Amount(literal="a convenir", value="")))
    cost = compute_real_cost(e)
    assert not cost.complete and cost.total is None and cost.undetermined == ("Flete o traslado",)
    assert cost.partial_sum == Decimal("1000")  # lo conocido se sigue mostrando, pero no es el total


def test_cost_freight_not_stated_does_not_appear():
    assert [p.item for p in compute_real_cost(prop(line())).steps] == ["Monto base"]


def test_cost_does_not_duplicate_freight_already_included_as_line():
    e = prop(line(total="1000"), line("freight", total="80"), conditions=Conditions(freight=m("80")))
    cost = compute_real_cost(e)
    assert cost.total == Decimal("1080")
    assert any("ya incluido" in p.detail for p in cost.steps)


def test_cost_does_not_duplicate_taxes_already_included_in_total():
    e = prop(line(total="1160"), totals=Totals(subtotal=m("1160"), taxes=[m("160")], total=m("1160")))
    cost = compute_real_cost(e)
    assert cost.total == Decimal("1160")


def test_cost_unreadable_line_leaves_base_undetermined():
    e = prop(Line(description="x", category="x", quantity=m("1"), unit_price=m("a"), line_total=m("a")))
    assert compute_real_cost(e).total is None


def test_cost_uses_decimal_without_float_error():
    e = prop(line(total="0.1"), conditions=Conditions(freight=m("0.2")))
    assert compute_real_cost(e).total == Decimal("0.3")


def test_convert_cost_to_other_currency_with_traceable_rate():
    c = convert_cost(compute_real_cost(prop(line(total="100"))), "VES", [rate()])
    assert c.total == Decimal("3650.00") and c.rates[0].source == "BCV"


def test_convert_incomplete_cost_does_not_invent_total():
    e = prop(line(), conditions=Conditions(freight=Amount(literal="a convenir", value="")))
    assert convert_cost(compute_real_cost(e), "VES", [rate()]).total is None


def test_convert_without_rate_fails_explicitly():
    with pytest.raises(RateUnavailable):
        convert_cost(compute_real_cost(prop(line())), "EUR", [rate()])


# ------------------------------------------------------------------ moneda
def test_inverse_conversion_and_same_currency():
    assert convert(Decimal("3650"), "VES", "USD", [rate()]) == (Decimal("100.00"), (rate(),))
    assert convert(Decimal("5"), "USD", "USD", []) == (Decimal("5"), ())


def test_conversion_via_bolivar_when_no_direct_rate():
    eur = rate("EUR", "VES", "40.00")
    amount, used = convert(Decimal("10"), "EUR", "USD", [rate(), eur])
    assert amount == Decimal("10.96") and len(used) == 2  # 10*40/36.5


def test_conversion_uses_the_latest_rate():
    old, new = rate(value="30", day=1), rate(value="40", day=5)
    assert convert(Decimal("1"), "USD", "VES", [old, new])[0] == Decimal("40.00")


@pytest.mark.parametrize(
    "kw",
    [
        {"value": Decimal(0)},
        {"value": Decimal("-1")},
        {"value": Decimal("NaN")},
        {"source": "  "},
        {"quote": "USD"},
        {"base": "dolar"},
    ],
)
def test_invalid_rate_is_rejected(kw):
    base = {
        "base": "USD",
        "quote": "VES",
        "value": Decimal("36"),
        "source": "BCV",
        "effective_date": date(2026, 11, 1),
        "origin": RateOrigin.MANUAL,
    }
    with pytest.raises(InvalidData):
        ExchangeRate(**(base | kw))


# ------------------------------------------------------------------ rúbrica
def crit(p, ev="quote") -> CriterionScore:
    return CriterionScore(score=p, evidence=[ev])


def test_total_score_weights_55_20_25():
    r = ScoredRubric(performance=crit(80), protection_and_peripherals=crit(50), warranty_and_support=crit(40))
    assert total_score(r) == Decimal("64.00")  # 44 + 10 + 10


def test_score_requires_evidence_if_greater_than_zero_and_range():
    with pytest.raises(ValidationError):
        CriterionScore(score=10, evidence=[" "])
    with pytest.raises(ValidationError):
        CriterionScore(score=101, evidence=["x"])
    assert CriterionScore(score=0).evidence == []


def test_weights_must_sum_to_100():
    with pytest.raises(InvalidData):
        Weights(performance=50)


# ------------------------------------------------------------------ ranking
def c(id, v=Verdict.VALID, p="80", cost=None) -> Candidate:
    return Candidate(id, v, Decimal(p) if v is Verdict.VALID else None, Decimal(cost) if cost else None)


def test_ranking_sorts_by_score_outside_equivalence():
    assert sort_ranking([c("a", p="70"), c("b", p="90"), c("c", p="80")]) == ("b", "c", "a")


def test_ranking_within_delta_breaks_tie_by_lower_cost():
    r = sort_ranking([c("expensive", p="90", cost="500"), c("barato", p="88", cost="300")])
    assert r == ("barato", "expensive")


def test_ranking_delta_is_measured_against_group_leader_without_chains():
    # 90, 88, 86, 84: con δ=3 el grupo del líder (90) es {90, 88}; 86 abre otro grupo con 84.
    candidates = [
        c("a", p="90", cost="9"),
        c("b", p="88", cost="1"),
        c("c", p="86", cost="9"),
        c("d", p="84", cost="1"),
    ]
    assert sort_ranking(candidates) == ("b", "a", "d", "c")


def test_ranking_unknown_cost_loses_the_tiebreak():
    assert sort_ranking([c("sin", p="90"), c("con", p="90", cost="999")]) == ("con", "sin")


def test_ranking_valid_first_then_pending_and_discarded_without_repeating():
    candidates = [
        c("z", Verdict.DISCARDED),
        c("p", Verdict.PENDING_REVIEW),
        c("v", p="10"),
        c("y", Verdict.DISCARDED),
    ]
    assert sort_ranking(candidates) == ("v", "p", "y", "z")


def test_ranking_is_deterministic_on_total_ties():
    assert sort_ranking([c("b", cost="1"), c("a", cost="1")]) == ("a", "b")


def test_ranking_rejects_repeated_and_valid_without_score():
    with pytest.raises(InvalidData):
        sort_ranking([c("a"), c("a")])
    with pytest.raises(InvalidData):
        sort_ranking([Candidate("a", Verdict.VALID)])


def test_ranking_zero_delta_only_groups_exact_ties():
    candidates = [c("a", p="90", cost="9"), c("b", p="89", cost="1")]
    assert sort_ranking(candidates, RankingParams(delta=Decimal(0))) == ("a", "b")
