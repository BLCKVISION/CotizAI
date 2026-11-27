"""Patterns that read supplier documents must stay fast on text built to make them backtrack."""

from __future__ import annotations

import time

import pytest

from evaluador.domain import especificaciones, team
from evaluador.domain.assistant import guardrails
from evaluador.domain.reglas import calidad, compatibilidad

BLANK = " " * 20_000


@pytest.mark.parametrize(
    "search",
    [
        lambda: guardrails._DATA_TAGS.search("<" + BLANK + "x"),
        lambda: guardrails._DATA_TAGS.search("<datos " * 3000),
        lambda: especificaciones._MEDIDA.match("1" + BLANK + "!"),
        lambda: especificaciones._DDR.search("ddr" + BLANK + "x"),
        lambda: especificaciones._SOCKET.search("lga" + BLANK + "x"),
        lambda: [p.search("core i5" + BLANK + "x") for p in calidad._OLD_PROCESSORS],
        lambda: calidad._OLD_MEMORY.search("ddr" + BLANK + "x"),
        lambda: compatibilidad._SIZE_AND_GENERATION.search("16 gb" + BLANK + "x"),
        lambda: compatibilidad._BOARD_MAXIMUM.search("max" + BLANK + "x"),
        lambda: compatibilidad._SLOTS.search("4" + BLANK + "x"),
        lambda: team._EMAIL.match("a@" + "a." * 10_000 + "@"),
    ],
)
def test_adversarial_text_does_not_stall_the_rules(search):
    start = time.perf_counter()
    search()
    assert time.perf_counter() - start < 0.2


def test_the_rewritten_patterns_read_the_same_text():
    for text in ("ddr4", "DDR 4", "ddr-5", "ddr - 5", "lpddr5"):
        assert especificaciones._DDR.search(text.lower()), text
    for text in ("lga1700", "am 5", "lga - 1700"):
        assert especificaciones._SOCKET.search(text), text
    assert especificaciones._MEDIDA.match(" 1.200 W ").groups() == ("1.200", "W")
    assert especificaciones._MEDIDA.match("750").group(1) == "750"
    assert compatibilidad._SIZE_AND_GENERATION.search("32gb (de ddr4") and compatibilidad._BOARD_MAXIMUM.search("max.: 64 gb")
    for tag in ("<datos>", "</ documento >", "< system x=1>"):
        assert guardrails._DATA_TAGS.search(tag), tag
    assert team._EMAIL.match("ana.rivas@demo.local") and not team._EMAIL.match("ana@local")
