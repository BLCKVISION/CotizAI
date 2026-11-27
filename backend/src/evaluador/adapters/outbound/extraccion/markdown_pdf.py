"""PDF to Markdown with pdfplumber: headings, framed blocks, real tables, and hidden or overlaid text apart."""

from __future__ import annotations

import io
import statistics
from dataclasses import dataclass
from typing import Any

import pdfplumber

from .pdf import leer_pdf, split_page

Box = tuple[float, float, float, float]  # left, top, right, bottom
_HEADING_RATIO = 1.5  # text this much larger than the page's usual size is a heading


def _cell(value: str | None) -> str:
    lines = (" ".join(line.split()) for line in (value or "").split("\n"))
    return "<br>".join(line for line in lines if line).replace("|", "\\|")


def _table(rows: list[list[str | None]]) -> str:
    cells = [[_cell(c) for c in row] for row in rows]
    width = max(len(row) for row in cells)
    lines = ["| " + " | ".join(row + [""] * (width - len(row))) + " |" for row in cells]
    lines.insert(1, "|" + " --- |" * width)
    return "\n".join(lines)


def _inside(obj: dict[str, Any], box: Box) -> bool:
    x, y = (obj["x0"] + obj["x1"]) / 2, (obj["top"] + obj["bottom"]) / 2
    return box[0] <= x <= box[2] and box[1] <= y <= box[3]


def _is_table(rows: list[list[str | None]]) -> bool:
    return len(rows) > 1 and max(len(r) for r in rows) > 1 and any(any(r) for r in rows)


@dataclass(frozen=True, slots=True)
class _Block:
    order: float
    left: float
    kind: str  # "line" blocks are merged into paragraphs
    content: str


def _frames(page: Any, tables: list[Box]) -> list[Box]:
    """Filled boxes, rounded or not. Each is read on its own so that boxes side by side do not mix their lines."""
    shapes = [o for o in [*page.curves, *page.rects] if o.get("fill") and o["width"] > 80 and 18 < o["height"] < 150]
    frames: list[Box] = []
    for shape in sorted(shapes, key=lambda o: o["width"] * o["height"], reverse=True):
        box = (shape["x0"], shape["top"], shape["x1"], shape["bottom"])
        if not any(_overlap(box, other) for other in [*tables, *frames]):
            frames.append(box)
    return frames


def _page(visible: Any) -> str:
    tables = [(found.bbox, _table(rows)) for found in visible.find_tables() if _is_table(rows := found.extract())]
    frames = _frames(visible, [box for box, _ in tables])
    boxes = [box for box, _ in tables] + frames
    outside = visible.filter(lambda o: o.get("object_type") != "char" or not any(_inside(o, b) for b in boxes))
    lines = outside.extract_text_lines()
    sizes = [c["size"] for c in visible.chars]
    usual = statistics.median(sizes) if sizes else 0.0

    def beside(box: Box) -> float:
        """A box is read after the loose lines standing to its left, so a title and its subtitle stay together."""
        tops = [line["top"] for line in lines if line["x1"] <= box[0] and box[1] <= line["top"] <= box[3]]
        return max([box[1], *tops]) + 0.1

    blocks = [_Block(beside(box), box[0], "table", content) for box, content in tables]
    for box in frames:
        text = visible.filter(lambda o, b=box: o.get("object_type") != "char" or _inside(o, b)).extract_text() or ""
        if text.strip():
            blocks.append(_Block(beside(box), box[0], "box", "  \n".join(text.strip().split("\n"))))
    for line in lines:
        heading = usual and statistics.median(c["size"] for c in line["chars"]) >= _HEADING_RATIO * usual
        content = f"### {line['text']}" if heading else line["text"]
        blocks.append(_Block(line["top"], line["x0"], "heading" if heading else "line", content))
    result: list[str] = []
    previous = ""
    for block in sorted(blocks, key=lambda b: (round(b.order), b.left)):
        if block.kind == "line" and previous == "line":
            result[-1] += "  \n" + block.content
        else:
            result.append(block.content)
        previous = block.kind
    return "\n\n".join(result)


def _overlap(a: Box, b: Box) -> bool:
    return min(a[2], b[2]) - max(a[0], b[0]) > 1 and min(a[3], b[3]) - max(a[1], b[1]) > 1


def pdf_to_markdown(data: bytes) -> tuple[str, list[str], tuple[int, ...]]:
    """(Markdown of the text layer, reading notices, pages without text that need OCR)."""
    content = leer_pdf(data)  # validates the file, enforces the limits and finds the scanned pages
    sections: list[str] = []
    overlaid: list[str] = []
    hidden: list[str] = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for number, page in enumerate(pdf.pages, start=1):
            if number in content.scanned_pages:
                continue
            layers = split_page(page)
            if body := _page(layers.visible):
                sections.append(f"## Página {number}\n\n{body}")
            if layers.overlaid:
                overlaid.append("  \n".join(f"Página {number}: {line}" for line in layers.overlaid))
            for reason, lines in layers.hidden.items():
                if lines:
                    hidden.append(f"### Página {number}: texto {reason}\n\n" + "  \n".join(lines))
    if overlaid:
        sections.append("## Texto superpuesto sobre otro\n\n" + "\n\n".join(overlaid))
    if hidden:
        sections.append("## Texto oculto detectado\n\n" + "\n\n".join(hidden))
    notices = [w for w in content.avisos if "sin texto" not in w]
    return "\n\n".join(sections), notices, content.scanned_pages
