"""El motor real aplica COMPAT, CAPACIDAD, CALIDAD y ABUSIVO (nodo `reglas_tecnicas`) de extremo a extremo."""

from evaluador.domain.evaluation import FindingCode, Verdict

from .test_engine import engine, evaluate, extraction, line, m

GOOD = {"cpu_socket": "AM4", "board_socket": "AM4", "ram_type": "DDR4", "board_ram_type": "DDR4", "cpu_tdp_w": "65 W",
         "psu_power_w": "500 W", "condition": "nuevo"}  # fmt: skip


def with_case(specs=None, description=None, **changes):
    gab = line("gabinete") | {"specs": {**GOOD, **(specs or {})}}
    if description:
        gab["description"] = description
    rest = [line(c) for c in ("monitor", "teclado", "raton", "protector")]
    return extraction(lines=[gab, *rest], **changes)


def codes(result) -> set[FindingCode]:
    return {h.code for h in result.findings}


def test_proposal_with_correct_specs_remains_valid():
    mt, _ = engine(with_case())
    assert evaluate(mt).verdict is Verdict.VALID


def test_ram_incompatibility_discards_by_compat():
    mt, _ = engine(with_case({"ram_type": "DDR5-5600"}))
    r = evaluate(mt)
    assert r.verdict is Verdict.DISCARDED and FindingCode.COMPAT in codes(r)


def test_insufficient_psu_discards_by_capacity():
    mt, _ = engine(with_case({"psu_power_w": "200 W"}))
    r = evaluate(mt)
    assert r.verdict is Verdict.DISCARDED and FindingCode.CAPACIDAD in codes(r)


def test_refurbished_device_discards_by_quality():
    mt, _ = engine(with_case(description="Gabinete reacondicionado"))
    r = evaluate(mt)
    assert r.verdict is Verdict.DISCARDED and FindingCode.CALIDAD in codes(r)


def test_excessive_freight_discards_as_abusive():
    mt, _ = engine(with_case(conditions={"freight": m("4000")}))
    r = evaluate(mt)
    assert r.verdict is Verdict.DISCARDED and FindingCode.ABUSIVO in codes(r)


def test_ambiguous_technical_datum_asks_review_and_does_not_discard():
    mt, _ = engine(with_case({"psu_power_w": "2 x 500 W"}))
    r = evaluate(mt)
    assert r.verdict is Verdict.PENDING_REVIEW and FindingCode.LECTURA in codes(r)
