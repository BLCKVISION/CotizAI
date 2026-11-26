"""Contrato de extracción: montos (literal, valor, null) y evidencia por línea."""

from evaluador.domain.contract import literal_matches, validate_contract
from evaluador.domain.evaluation import FindingCode
from evaluador.domain.extraction import Amount, Evidence, Line, ProposalExtraction, Totals
from evaluador.domain.rules.arithmetic import validate_arithmetic
from evaluador.domain.rules.scope import validate_fixed_scope


def m(literal: str, value: str) -> Amount:
    return Amount(literal=literal, value=value)


def line(**kw) -> Line:
    base = dict(
        description="Monitor", category="monitor", quantity=m("11", "11"), unit_price=m("100,00", "100.00"),
        line_total=m("1.100,00", "1100.00"), evidence=Evidence(page_or_cell="p.1", text="Monitor 11 x 100,00"),
    )  # fmt: skip
    return Line(**(base | kw))


def ext(*lines: Line, **kw) -> ProposalExtraction:
    return ProposalExtraction(lines=list(lines), **kw)


def test_valid_contract_has_no_problems():
    assert validate_contract(ext(line(), totals=Totals(total=m("1.100,00", "1100.00")))) == []


def test_quantity_and_price_can_be_null_without_breaking_the_model():
    e = ext(line(quantity=None, unit_price=None, line_total=None))
    assert validate_contract(e) == []
    assert e.lines[0].quantity is None


def test_line_without_evidence_is_a_problem():
    (p,) = validate_contract(ext(line(evidence=Evidence())))
    assert "Línea 1" in p and "evidencia" in p


def test_whitespace_only_evidence_does_not_count():
    assert validate_contract(ext(line(evidence=Evidence(page_or_cell="p.1", text="  "))))


def test_non_numeric_value_with_literal_is_a_problem():
    (p,) = validate_contract(ext(line(unit_price=m("100,00", "cien"))))
    assert "unit_price" in p


def test_value_without_literal_is_made_up_value():
    (p,) = validate_contract(ext(line(quantity=m("", "11"))))
    assert "quantity" in p


def test_value_not_matching_literal_is_a_problem():
    # el modelo «corrigió» 1.100,00 a 1000.00: el contrato lo rechaza
    (p,) = validate_contract(ext(line(line_total=m("1.100,00", "1000.00"))))
    assert "line_total" in p


def test_totals_are_also_validated():
    (p,) = validate_contract(ext(line(), totals=Totals(subtotal=m("1.100,00", "9999"))))
    assert "subtotal" in p


def test_literal_with_regional_formats():
    assert literal_matches("1.100,00", "1100.00")
    assert literal_matches("1,100.00", "1100.00")
    assert literal_matches("$ 1 100,50", "1100.50")
    assert literal_matches("11", "11")
    assert literal_matches("1.100", "1100")  # miles
    assert literal_matches("1,5", "1.5")
    assert not literal_matches("1.100,00", "1100.01")
    assert not literal_matches("abc", "1")


def test_rules_tolerate_null_amounts_and_ask_review_instead_of_failing():
    e = ext(line(quantity=None, unit_price=None))
    assert [h.code for h in validate_arithmetic(e)] == [FindingCode.LECTURA]
    assert all(not h.discards for h in validate_fixed_scope(e) if h.code is FindingCode.LECTURA)
