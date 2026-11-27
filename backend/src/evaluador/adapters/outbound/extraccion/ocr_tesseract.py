"""OCR with Tesseract, run locally: no cost per page and the image never leaves the server."""

from __future__ import annotations

import csv
import io
import os
import shutil
import statistics
import subprocess  # noqa: S404 - fixed program and arguments; the image only travels through stdin
from collections.abc import Callable, Sequence
from dataclasses import dataclass, replace

import numpy as np
from PIL import Image, ImageOps

from evaluador.application.ports.documentos import OcrResult
from evaluador.domain.errores import DatoInvalido, ServicioNoDisponible

from .ocr_layout import Box, Table, analyse, deskew
from .preprocess import enhance

LANGUAGES = "spa+eng"
OCR_LONG_SIDE = int(os.environ.get("EVALUADOR_OCR_LONG_SIDE", "2200"))
CellReader = Callable[[Box], list["_Word"]]
TIMEOUT_SECONDS = 90
_DOUBTFUL_BELOW = 60  # word confidence under which a figure is not trusted
_SURE_FROM = 80  # a one-word cell under this confidence is read again on its own
_COLUMN_GAP = 1.6  # a horizontal gap this many times the text height separates two cells


@dataclass(frozen=True, slots=True)
class _Word:
    line: tuple[str, str, str]
    left: int
    top: int
    width: int
    height: int
    confidence: float
    text: str


def _words(tsv: str) -> list[_Word]:
    words = []
    for row in csv.DictReader(io.StringIO(tsv), delimiter="\t", quoting=csv.QUOTE_NONE):
        text = (row.get("text") or "").strip()
        if row.get("level") != "5" or not text or float(row["conf"]) < 0:
            continue
        if text != "|" and not any(c.isalnum() for c in text):  # specks and leftovers of borders
            continue
        words.append(_Word((row["block_num"], row["par_num"], row["line_num"]), int(row["left"]), int(row["top"]),
                           int(row["width"]), int(row["height"]), float(row["conf"]), text))  # fmt: skip
    # A "|" between two words of a line is the document's own separator; at an end it is what is left of a border.
    ends: dict[tuple[str, str, str], list[int]] = {}
    for w in words:
        if w.text != "|":
            ends.setdefault(w.line, []).append(w.left)
    return [w for w in words if w.text != "|" or (w.line in ends and min(ends[w.line]) < w.left < max(ends[w.line]))]


def _rows(words: list[_Word]) -> list[list[str]]:
    """Lines in reading order, each one split into cells where the gap between words is wide."""
    if not words:
        return []
    gap = _COLUMN_GAP * statistics.median(w.height for w in words)
    lines: dict[tuple[str, str, str], list[_Word]] = {}
    for word in words:
        lines.setdefault(word.line, []).append(word)
    rows = []
    for line in lines.values():
        cells, current, end = [], [], None
        for word in sorted(line, key=lambda w: w.left):
            if end is not None and word.left - end > gap:
                cells.append(" ".join(current))
                current = []
            current.append(word.text)
            end = word.left + word.width
        rows.append([*cells, " ".join(current)])
    return rows


def _markdown(rows: list[list[str]]) -> str:
    """Consecutive lines with the same number of cells (three or more) become a Markdown table. Two columns are
    usually two blocks side by side, and ruled tables are built from their lines instead."""
    blocks: list[str] = []
    i = 0
    while i < len(rows):
        width, j = len(rows[i]), i + 1
        while width > 2 and j < len(rows) and len(rows[j]) == width:
            j += 1
        if width > 2 and j - i > 1:
            table = ["| " + " | ".join(c.replace("|", "\\|") for c in row) + " |" for row in rows[i:j]]
            table.insert(1, "|" + " --- |" * width)
            blocks.append("\n".join(table))
        else:
            blocks.append("  \n".join(" · ".join(row) for row in rows[i:j]))
        i = j
    return "\n\n".join(blocks)


def _within(word: _Word, box: Box) -> bool:
    x, y = word.left + word.width / 2, word.top + word.height / 2
    return box[0] <= x <= box[2] and box[1] <= y <= box[3]


def _cell_lines(words: list[_Word]) -> list[str]:
    return [" ".join(row) for row in _rows_joined(words)]


def _rows_joined(words: list[_Word]) -> list[list[str]]:
    """The lines inside one cell, without splitting them further."""
    lines: dict[tuple[str, str, str], list[_Word]] = {}
    for word in words:
        lines.setdefault(word.line, []).append(word)
    ordered = sorted(lines.values(), key=lambda ws: min(w.top for w in ws))
    return [[w.text for w in sorted(ws, key=lambda w: w.left)] for ws in ordered]


def _header_box(table: Table, words: list[_Word]) -> tuple[list[Box], list[_Word]]:
    """A header printed on a coloured band has no ruled line above it: take the text just over the first rule."""
    height = statistics.median(w.height for w in words) if words else 0
    top = table.box[1]
    above = [w for w in words if top - 2.2 * height <= w.top + w.height / 2 < top
             and table.box[0] <= w.left + w.width / 2 <= table.box[2]]  # fmt: skip
    columns = max(table.cells, key=len)
    boxes = [(left, int(top - 2.2 * height), right, top) for left, _, right, _ in columns]
    filled = sum(any(_within(w, box) for w in above) for box in boxes)
    return (boxes, above) if filled >= len(boxes) - 1 else ([], [])


def _table_rows(
    table: Table, words: list[_Word], read_cell: CellReader | None, taken: set[int]
) -> tuple[list[list[str]], set[int]]:
    """Cells with their lines joined by <br>, and the ids of the words used."""
    used = set(taken)
    header, _ = _header_box(table, words)
    columns = [left for left, _, _, _ in max(table.cells, key=len)]
    rows = []
    for boxes in ([header] if header else []) + table.cells:
        cells = [""] * len(columns)
        for box in boxes:
            inside = [w for w in words if id(w) not in used and _within(w, box)]
            used |= {id(w) for w in inside}
            if read_cell is not None and _needs_closer_look(inside):
                again = read_cell(box)
                if again and _certainty(again) > _certainty(inside):
                    # The first attempt is discarded, so it neither stays as loose text nor counts as doubtful.
                    words[:] = [w for w in words if all(w is not old for old in inside)] + again
                    inside = again
                    used |= {id(w) for w in inside}
            # A merged cell goes in the first column it covers.
            column = min(range(len(columns)), key=lambda i: abs(columns[i] - box[0]))
            cells[column] = "<br>".join(_cell_lines(inside))
        if any(cells):
            rows.append(cells)
    return rows, used


def _certainty(words: list[_Word]) -> float:
    return statistics.fmean(w.confidence for w in words) if words else -1.0


def _needs_closer_look(words: list[_Word]) -> bool:
    """A lone digit is often missed or misread when reading the whole page."""
    if not words:
        return True
    return len(words) == 1 and (len(words[0].text) <= 2 or words[0].confidence < _SURE_FROM)


def _markdown_table(rows: list[list[str]]) -> str:
    width = max(len(r) for r in rows)
    lines = ["| " + " | ".join([c.replace("|", "\\|") for c in r] + [""] * (width - len(r))) + " |" for r in rows]
    lines.insert(1, "|" + " --- |" * width)
    return "\n".join(lines)


def parse_tsv(tsv: str, tables: Sequence[Table] = (), read_cell: CellReader | None = None) -> OcrResult:
    words = _words(tsv)
    blocks: list[tuple[int, str, str]] = []  # (top, markdown, plain text)
    used: set[int] = set()
    for table in tables:
        rows, taken = _table_rows(table, words, read_cell, used)
        used |= taken
        if rows:
            plain = "\n".join(" | ".join(c.replace("<br>", " ") for c in r) for r in rows)
            blocks.append((table.box[1], _markdown_table(rows), plain))
    loose = [w for w in words if id(w) not in used]
    # Loose text is read in the stretches above, between and below the tables.
    limits = [0, *sorted(t.box[1] for t in tables), 10**9]
    for start, end in zip(limits, limits[1:], strict=False):
        rows = _rows([w for w in loose if start <= w.top + w.height / 2 < end])
        if rows:
            first = min(w.top for w in loose if start <= w.top + w.height / 2 < end)
            blocks.append((first, _markdown(rows), "\n".join(" | ".join(r) for r in rows)))
    blocks.sort(key=lambda b: b[0])
    doubtful = tuple(dict.fromkeys(
        w.text for w in words if w.confidence < _DOUBTFUL_BELOW and any(c.isdigit() for c in w.text)
    ))  # fmt: skip
    confidence = statistics.fmean(w.confidence for w in words) if words else 0.0
    return OcrResult("\n\n".join(b[1] for b in blocks), "\n".join(b[2] for b in blocks), round(confidence, 1), doubtful)


def _large_enough(image: Image.Image) -> Image.Image:
    """Small print needs more pixels for OCR than for a vision model."""
    long_side = max(image.size)
    if long_side >= OCR_LONG_SIDE:
        return image
    factor = OCR_LONG_SIDE / long_side
    return image.resize((round(image.width * factor), round(image.height * factor)), Image.Resampling.LANCZOS)


class TesseractOcr:
    def __init__(self, binary: str) -> None:
        self._binary = binary

    @classmethod
    def if_available(cls) -> TesseractOcr | None:
        binary = shutil.which("tesseract")
        return cls(binary) if binary else None

    def __call__(self, image: bytes) -> OcrResult:
        prepared = enhance(image)  # upright, enlarged and sharpened; rejects corrupt or oversized files
        layout = analyse(deskew(_large_enough(Image.open(io.BytesIO(prepared)))))
        page = Image.fromarray(layout.clean)

        def read_cell(box: Box) -> list[_Word]:
            left, top, right, bottom = box
            if right - left < 16 or bottom - top < 16:
                return []
            inner = page.crop((left + 4, top + 4, right - 4, bottom - 4))
            if np.median(np.asarray(inner)) < 128:  # white text on a coloured header
                inner = ImageOps.invert(inner)
            ink = np.argwhere(np.asarray(inner) < 170)
            if len(ink) < 12:  # an empty cell
                return []
            (y0, x0), (y1, x1) = ink.min(axis=0), ink.max(axis=0)
            crop = ImageOps.expand(inner.crop((x0, y0, x1 + 1, y1 + 1)), border=20, fill=255)
            crop = crop.resize((crop.width * 2, crop.height * 2), Image.Resampling.LANCZOS)
            found = _words(self._run(crop, "7"))
            return [
                replace(w, line=("cell", str(box), w.line[2]), left=left + 5 + int(x0), top=top + 5 + int(y0),
                        width=1, height=int(y1 - y0) + 1)
                for w in found
            ]  # fmt: skip

        return parse_tsv(self._run(page, "6"), layout.tables, read_cell)

    def _run(self, page: Image.Image, mode: str) -> str:
        buffer = io.BytesIO()
        page.save(buffer, format="PNG")
        try:
            done = subprocess.run(  # noqa: S603
                [self._binary, "stdin", "stdout", "-l", LANGUAGES, "--psm", mode, "tsv"],
                input=buffer.getvalue(), capture_output=True, timeout=TIMEOUT_SECONDS, check=False,
                env={**os.environ, "OMP_THREAD_LIMIT": "1"},  # shared server: one core per page
            )  # fmt: skip
        except subprocess.TimeoutExpired:
            raise DatoInvalido("El OCR tardó demasiado con esta imagen.") from None
        if done.returncode != 0:
            raise ServicioNoDisponible("El OCR no está disponible: falta Tesseract o su idioma español.")
        return done.stdout.decode("utf-8", errors="replace")
