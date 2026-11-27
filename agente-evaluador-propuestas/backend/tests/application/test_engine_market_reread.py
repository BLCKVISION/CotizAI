"""Motor: precios de mercado opcionales (N-4) y segunda lectura antes de descartar por aritmética (IA-6)."""

from datetime import UTC, datetime
from decimal import Decimal

from evaluador.adapters.outbound.agent.langgraph_engine import LanggraphEngine
from evaluador.adapters.outbound.agent.reread import RereadLine, RereadLines
from evaluador.adapters.outbound.ai.fake_embedder import FakeEmbedder
from evaluador.adapters.outbound.ai.fake_model import FakeModel
from evaluador.adapters.outbound.memory.vector_index import InMemoryIndex
from evaluador.adapters.outbound.search.fake import FakeMarketPrices
from evaluador.domain.evaluation import FindingCode, Severity, Verdict
from evaluador.domain.extraction import Amount, ProposalExtraction, ScopeJudgment
from evaluador.domain.market import PriceReference
from evaluador.domain.rag import Chunk

CATS = ("gabinete", "monitor", "teclado", "raton", "protector")
NOW = datetime(2026, 1, 1, tzinfo=UTC)


def m(v: str) -> dict:
    return {"literal": v, "value": v}


def line(cat: str, qty="11", price="100.00", total="1100.00") -> dict:
    return {
        "description": f"{cat} modelo X", "category": cat, "quantity": m(qty), "unit_price": m(price),
        "line_total": m(total), "evidence": {"page_or_cell": "p.1", "text": f"{cat} {qty} x {price} = {total}"},
    }  # fmt: skip


def extraction(lines=None, **kw) -> ProposalExtraction:
    lines = lines or [line(c) for c in CATS]
    return ProposalExtraction.model_validate(
        {"currency": "USD", "lines": lines, "totals": {"subtotal": m("5500.00"), "total": m("5500.00")}, **kw}
    )


def build(ext, reread=None, market=None, **engine_kw):
    responses = {ProposalExtraction: ext, ScopeJudgment: ScopeJudgment(meets=True)}
    if reread is not None:
        responses[RereadLines] = reread
    model = FakeModel(responses)
    emb, idx = FakeEmbedder(), InMemoryIndex()
    chunk = Chunk("f1", "t1", "p1", 0, "Incluye instalación, garantía de 3 años y soporte técnico.")
    idx.index([chunk], emb.embed_documents([chunk.content]))
    return LanggraphEngine(model, emb, idx, market=market, **engine_kw), model


def run(engine, text="propuesta 1100.00 normal"):
    return engine.evaluate(tenant_id="t1", proposal_id="p1", requirement="11 equipos", text=text)


def refs(price: str, sources: int) -> list[PriceReference]:
    return [PriceReference(Decimal(price), "USD", f"tienda{i}.com", NOW) for i in range(sources)]


# ------------------------------------------------------------------ N-4 mercado
def overpriced():
    return extraction([line("monitor", price="300.00", total="3300.00")] + [line(c) for c in CATS if c != "monitor"],
                      totals={"subtotal": m("7700.00"), "total": m("7700.00")})  # fmt: skip


def test_without_market_source_engine_behaves_as_before():
    assert run(build(overpriced())[0]).verdict is Verdict.VALID


def test_overprice_with_enough_independent_sources_discards_and_cites_them():
    mk = FakeMarketPrices({"monitor": refs("100", 3)})
    r = run(build(overpriced(), market=mk)[0])
    assert r.verdict is Verdict.DISCARDED
    (h,) = [f for f in r.findings if f.code is FindingCode.ABUSIVO and f.discards]
    assert "tienda0.com" in h.evidence and "tienda2.com" in h.evidence


def test_overprice_with_fewer_sources_than_required_does_not_discard():
    mk = FakeMarketPrices({"monitor": refs("100", 2)})
    r = run(build(overpriced(), market=mk)[0])
    assert r.verdict is Verdict.VALID
    assert any(f.code is FindingCode.ABUSIVO and not f.discards for f in r.findings)


def test_min_references_is_configurable():
    mk = FakeMarketPrices({"monitor": refs("100", 2)})
    r = run(build(overpriced(), market=mk, min_references=2)[0])
    assert r.verdict is Verdict.DISCARDED


def test_lines_without_references_are_informational_not_discarding():
    r = run(build(extraction(), market=FakeMarketPrices({}))[0])
    assert r.verdict is Verdict.VALID
    infos = [f for f in r.findings if f.code is FindingCode.ABUSIVO]
    assert infos and all(f.severity is Severity.INFO and not f.discards for f in infos)


def test_failing_market_source_is_not_a_proposal_error():
    mk = FakeMarketPrices({"monitor": refs("100", 3)}, fail_times=99)
    assert run(build(overpriced(), market=mk)[0]).verdict is Verdict.VALID


def test_each_distinct_component_is_queried_once_per_proposal():
    two_monitors = extraction([line("monitor"), line("monitor"), line("teclado")] + [line(c) for c in CATS[:1] + CATS[3:]],
                              totals={"subtotal": m("6600.00"), "total": m("6600.00")})  # fmt: skip
    mk = FakeMarketPrices({})
    run(build(two_monitors, market=mk)[0])
    assert sorted(q.category for q in mk.queries).count("monitor") == 1


# ------------------------------------------------------------------ IA-6 segunda lectura
def misread() -> ProposalExtraction:
    """La primera lectura confundió el total de la línea 1: 1000.00 en vez de 1100.00."""
    return extraction([line("gabinete", total="1000.00")] + [line(c) for c in CATS[1:]])


def fix(total: str, line_no: int = 1) -> RereadLines:
    return RereadLines(lines=[RereadLine(line=line_no, quantity=Amount(literal="11", value="11"),
                                         unit_price=Amount(literal="100.00", value="100.00"),
                                         line_total=Amount(literal=total, value=total))])  # fmt: skip


def test_consistent_second_reading_is_used_and_no_discard_happens():
    engine, model = build(misread(), reread=fix("1100.00"))
    r = run(engine, text="gabinete 11 x 100.00 = 1100.00")
    assert r.verdict is Verdict.VALID
    assert r.extraction is not None and r.extraction.lines[0].line_total.value == "1100.00"
    assert any(f.code is FindingCode.ARITMETICA and f.severity is Severity.INFO and not f.discards for f in r.findings)
    assert len([c for c in model.calls if "SOLO las líneas" in c[0]]) == 1


def test_inconsistent_second_reading_keeps_the_discard():
    r = run(build(misread(), reread=fix("1000.00"))[0], text="gabinete 11 x 100.00 = 1000.00")
    assert r.verdict is Verdict.DISCARDED
    assert any(f.code is FindingCode.ARITMETICA and f.discards for f in r.findings)
    assert r.extraction is not None and r.extraction.lines[0].line_total.value == "1000.00"


def test_second_reading_with_a_figure_not_in_the_document_is_rejected():
    r = run(build(misread(), reread=fix("1100.00"))[0], text="el documento no menciona esa cifra: 1000.00")
    assert r.verdict is Verdict.DISCARDED


def test_second_reading_only_asks_for_the_flagged_lines():
    engine, model = build(misread(), reread=fix("1100.00"))
    run(engine, text="1100.00")
    (instr, _) = next(c for c in model.calls if "SOLO las líneas" in c[0])
    assert "[1]" in instr and "[2]" not in instr


def test_reread_ignores_lines_it_was_not_asked_about():
    sneaky = RereadLines(lines=[*fix("1100.00").lines, RereadLine(line=2, quantity=Amount(literal="1", value="1"),
                                                                   unit_price=None, line_total=None)])  # fmt: skip
    r = run(build(misread(), reread=sneaky)[0], text="1100.00")
    assert r.extraction is not None and r.extraction.lines[1].quantity is not None
    assert r.extraction.lines[1].quantity.value == "11"


def test_no_second_reading_when_arithmetic_is_fine():
    engine, model = build(extraction(), reread=fix("1100.00"))
    run(engine)
    assert not [c for c in model.calls if "SOLO las líneas" in c[0]]


def test_failing_reread_model_keeps_original_findings():
    r = run(build(misread())[0])  # sin respuesta para RereadLines: el modelo falso lanza
    assert r.verdict is Verdict.DISCARDED


def test_unreadable_amount_is_reread_and_stays_pending_if_still_unreadable():
    bad = extraction([{**line("gabinete"), "line_total": None}] + [line(c) for c in CATS[1:]])
    still_none = RereadLines(lines=[RereadLine(line=1, quantity=None, unit_price=None, line_total=None)])
    r = run(build(bad, reread=still_none)[0], text="gabinete ilegible")
    assert r.verdict is Verdict.PENDING_REVIEW
    assert any(f.code is FindingCode.LECTURA for f in r.findings)
