"""Separates text drawn on top of other text, using the order in which the PDF draws it.

Reading by position alone interleaves two strings printed in the same place letter by letter, which invents words and
figures that are not in the document. Drawing order keeps each string whole.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

Char = dict[str, Any]
# Copies this close are the same glyph or string drawn again to fake bold. In tiny text the limit shrinks with the
# size, below the width of a narrow letter, so real double letters are never merged.
_SAME_PLACE_PT = 0.5
_SAME_PLACE_PER_SIZE = 0.15


def _tolerance(size: float) -> float:
    return min(_SAME_PLACE_PT, _SAME_PLACE_PER_SIZE * size)


@dataclass(slots=True)
class Run:
    """Consecutive glyphs of one string."""

    chars: list[Char]

    @property
    def text(self) -> str:
        return "".join(c["text"] for c in self.chars)

    @property
    def left(self) -> float:
        return float(min(c["x0"] for c in self.chars))

    @property
    def right(self) -> float:
        return float(max(c["x1"] for c in self.chars))

    @property
    def top(self) -> float:
        return float(self.chars[0]["top"])

    @property
    def size(self) -> float:
        return float(self.chars[0]["size"])


def _copy(a: Char, b: Char) -> bool:
    near = _tolerance(a["size"])
    return bool(a["text"] == b["text"] and abs(a["x0"] - b["x0"]) <= near and abs(a["top"] - b["top"]) <= near)


def _continues(previous: Char, char: Char) -> bool:
    gap = char["x0"] - previous["x1"]
    return bool((abs(char["top"] - previous["top"]) < 0.05 and abs(char["size"] - previous["size"]) < 0.05)
            and -0.25 * char["size"] <= gap <= 1.2 * char["size"])  # fmt: skip


def runs_of(chars: list[Char]) -> list[Run]:
    """Strings in drawing order, without the glyphs or strings repeated in the same place."""
    runs: list[Run] = []
    previous: Char | None = None
    for char in chars:
        if previous is not None and _copy(previous, char):
            continue
        if runs and previous is not None and _continues(previous, char):
            runs[-1].chars.append(char)
        else:
            runs.append(Run([char]))
        previous = char
    kept: list[Run] = []
    for run in runs:
        repeated = any(
            k.text == run.text and abs(k.left - run.left) <= _tolerance(run.size)
            and abs(k.top - run.top) <= _tolerance(run.size)
            for k in kept
        )
        if not repeated:
            kept.append(run)
    return kept


def _collides(a: Run, b: Run) -> bool:
    if abs(a.top - b.top) >= 0.5 * min(a.size, b.size):
        return False
    shared = min(a.right, b.right) - max(a.left, b.left)
    return shared > 0.5 * max(min(a.right - a.left, b.right - b.left), 0.1)


def split_overlaps(runs: list[Run]) -> tuple[list[Run], list[Run]]:
    """(first layer, strings drawn over it)."""
    first: list[Run] = []
    over: list[Run] = []
    for run in runs:
        if run.text.strip() and any(f.text.strip() and _collides(f, run) for f in first):
            over.append(run)
        else:
            first.append(run)
    return first, over


def lines_in_drawing_order(runs: list[Run]) -> list[str]:
    """Joins the pieces of each line without mixing layers; lines keep the order in which they were drawn."""
    lines: list[list[Run]] = []
    for run in runs:
        for line in reversed(lines):
            same_height = abs(line[0].top - run.top) < 0.3 * run.size
            if same_height and not any(min(r.right, run.right) - max(r.left, run.left) > 0.5 for r in line):
                line.append(run)
                break
        else:
            lines.append([run])
    texts = []
    for line in lines:
        text, end = "", None
        for run in sorted(line, key=lambda r: r.left):
            if end is not None and run.left - end > 0.2 * run.size:
                text += " "
            text += run.text
            end = run.right
        if text.strip():
            texts.append(" ".join(text.split()))
    return texts
