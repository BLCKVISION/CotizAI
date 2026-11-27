"""N-4: agregación de referencias de mercado y regla ABUSIVO con «sin referencia suficiente»."""

from datetime import UTC, datetime
from decimal import Decimal

from evaluador.domain.evaluation import FindingCode, Severity
from evaluador.domain.extraction import ProposalExtraction
from evaluador.domain.market import PriceReference, reference_from_prices
from evaluador.domain.rules.abusive import AbuseParams, MarketReference, validate_abuse

NOW = datetime(2026, 1, 1, tzinfo=UTC)


def ref(price: str, source: str, currency: str = "USD") -> PriceReference:
    return PriceReference(Decimal(price), currency, source, NOW)


def prop(price="200", currency="USD") -> ProposalExtraction:
    amount = lambda v: {"literal": v, "value": v}  # noqa: E731
    return ProposalExtraction.model_validate({
        "currency": currency,
        "lines": [{"description": "Monitor 27", "category": "monitor", "quantity": amount("1"),
                   "unit_price": amount(price), "line_total": amount(price),
                   "evidence": {"page_or_cell": "p.1", "text": "Monitor 27 - 1 x " + price}}],
    })  # fmt: skip


# ---- agregación ----
def test_aggregate_uses_median_and_counts_distinct_sources():
    r = reference_from_prices([ref("90", "a.com"), ref("100", "b.com"), ref("500", "c.com")], "USD")
    assert r is not None and r.unit_price == Decimal("100.00") and r.sources == 3


def test_aggregate_same_source_twice_is_one_source():
    r = reference_from_prices([ref("90", "a.com"), ref("110", "a.com")], "USD")
    assert r is not None and r.sources == 1


def test_aggregate_prefers_proposal_currency_and_cites_sources():
    r = reference_from_prices([ref("100", "a.com", "VES"), ref("90", "b.com"), ref("95", "c.com")], "USD")
    assert r is not None and r.currency == "USD" and r.sources == 2
    assert "b.com" in r.citation and "c.com" in r.citation and "a.com" not in r.citation


def test_aggregate_empty_or_invalid_prices_gives_none():
    assert reference_from_prices([], "USD") is None
    assert reference_from_prices([ref("0", "a.com"), ref("-5", "b.com")], "USD") is None


# ---- regla ----
def test_enough_sources_discards_and_cites_references_in_evidence():
    r = reference_from_prices([ref("100", "a.com"), ref("100", "b.com"), ref("100", "c.com")], "USD")
    (h,) = validate_abuse(prop("200"), {1: r}, AbuseParams(min_sources=3))
    assert h.discards and "a.com" in h.evidence and "b.com" in h.evidence


def test_fewer_than_min_sources_never_discards_even_if_overpriced():
    r = reference_from_prices([ref("100", "a.com"), ref("100", "b.com")], "USD")
    (h,) = validate_abuse(prop("200"), {1: r}, AbuseParams(min_sources=3))
    assert not h.discards and "a.com" in h.evidence and "2" in h.reason


def test_single_reference_never_discards_even_if_min_sources_is_one():
    refs = {1: MarketReference(Decimal("100"), "USD", sources=1)}
    (h,) = validate_abuse(prop("999"), refs, AbuseParams(min_sources=1))
    assert not h.discards


def test_fair_price_with_insufficient_references_reports_info_not_enough_reference():
    r = reference_from_prices([ref("100", "a.com")], "USD")
    (h,) = validate_abuse(prop("100"), {1: r}, AbuseParams(min_sources=3))
    assert h.code is FindingCode.ABUSIVO and h.severity is Severity.INFO and not h.discards
    assert "sin referencia suficiente" in h.reason.lower()


def test_line_without_any_reference_is_reported_as_not_enough_reference():
    (h,) = validate_abuse(prop("100"), {}, AbuseParams(min_sources=3), unreferenced={1: 0})
    assert h.severity is Severity.INFO and not h.discards and "sin referencia suficiente" in h.reason.lower()
