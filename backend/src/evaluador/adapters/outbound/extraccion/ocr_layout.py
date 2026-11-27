"""Page geometry for OCR: straightens a photo, finds the ruled tables and erases their lines.

Table borders confuse the engine (cells with a single digit disappear), yet they say exactly where each cell is.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from PIL import Image

_INK_BELOW = 235  # grey level under which a pixel is not paper
_MAX_SKEW_DEGREES = 3.0

Box = tuple[int, int, int, int]  # left, top, right, bottom


def deskew(image: Image.Image) -> Image.Image:
    """Rotates so that text lines are level: level lines give the sharpest row-by-row ink profile."""
    small = image.convert("L")
    small.thumbnail((700, 700))

    def sharpness(angle: float) -> float:
        turned = small.rotate(angle, resample=Image.Resampling.BILINEAR, fillcolor=255)
        return float(np.var((np.asarray(turned) < _INK_BELOW).sum(axis=1)))

    angles = [a / 5 for a in range(int(-_MAX_SKEW_DEGREES * 5), int(_MAX_SKEW_DEGREES * 5) + 1)]
    best = max(angles, key=sharpness)
    if abs(best) < 0.3 or sharpness(best) < 1.05 * sharpness(0.0):
        return image
    return image.rotate(best, resample=Image.Resampling.BICUBIC, expand=True, fillcolor="white")


def _run_lengths(mask: np.ndarray) -> np.ndarray:
    """For every True pixel, the length of the horizontal run it belongs to."""
    lengths = np.zeros(mask.shape, np.int32)
    padded = np.zeros(mask.shape[1] + 2, np.int8)
    for i, row in enumerate(mask):
        padded[1:-1] = row
        edges = np.flatnonzero(np.diff(padded))
        for start, end in zip(edges[::2], edges[1::2], strict=True):
            lengths[i, start:end] = end - start
    return lengths


def _spans(flags: np.ndarray) -> list[tuple[int, int]]:
    edges = np.flatnonzero(np.diff(np.concatenate(([0], flags.astype(np.int8), [0]))))
    return list(zip(edges[::2].tolist(), edges[1::2].tolist(), strict=True))


@dataclass(frozen=True, slots=True)
class Table:
    box: Box
    cells: list[list[Box]]  # rows, each with its cells from left to right


@dataclass(frozen=True, slots=True)
class Layout:
    clean: np.ndarray  # greyscale page without table lines
    tables: list[Table]


def analyse(image: Image.Image) -> Layout:
    grey = np.array(image.convert("L"))
    ink = grey < _INK_BELOW
    across, down = _run_lengths(ink), _run_lengths(ink.T).T
    unit = max(grey.shape) / 2000
    flat = (across > 120 * unit) & (down <= 9 * unit)  # long and thin
    upright = (down > 70 * unit) & (across <= 9 * unit)
    clean = grey.copy()
    clean[flat | upright] = 255
    return Layout(clean, _tables(flat, upright, unit))


def _tables(flat: np.ndarray, upright: np.ndarray, unit: float) -> list[Table]:
    wide = 0.4 * flat.shape[1]
    rules: list[tuple[int, int, int]] = []  # (y, left, right) of horizontal lines spanning much of the page
    for top, bottom in _spans(flat.sum(axis=1) > wide):
        columns = np.flatnonzero(flat[top:bottom].any(axis=0))
        rules.append(((top + bottom) // 2, int(columns[0]), int(columns[-1])))
    groups: list[list[tuple[int, int, int]]] = []
    for rule in rules:
        previous = groups[-1][-1] if groups else None
        if previous and abs(rule[1] - previous[1]) < 25 * unit and abs(rule[2] - previous[2]) < 25 * unit:
            groups[-1].append(rule)
        else:
            groups.append([rule])
    tables: list[Table] = []
    for group in groups:
        rows: list[list[Box]] = []
        for (top, left, right), (bottom, _, _) in zip(group, group[1:], strict=False):
            if bottom - top < 14 * unit:
                continue
            band = upright[top + 3 : bottom - 3, max(left - 4, 0) : right + 5]
            marks = band.mean(axis=0) > 0.6
            edge = int(14 * unit)
            if not (marks[:edge].any() and marks[-edge:].any()):  # a gap between blocks, not a ruled row
                _add_table(tables, rows)
                rows = []
                continue
            separators = [max(left - 4, 0) + (a + b) // 2 for a, b in _spans(marks)]
            edges = [left, *(x for x in separators if left + 12 * unit < x < right - 12 * unit), right]
            rows.append([(a, top, b, bottom) for a, b in zip(edges, edges[1:], strict=False)])
        _add_table(tables, rows)
    return tables


def _add_table(tables: list[Table], rows: list[list[Box]]) -> None:
    """Two ruled rows with columns make a table; a single framed box is just text."""
    if len(rows) >= 2 and max(len(r) for r in rows) >= 3:
        tables.append(Table((rows[0][0][0], rows[0][0][1], rows[0][-1][2], rows[-1][0][3]), rows))
