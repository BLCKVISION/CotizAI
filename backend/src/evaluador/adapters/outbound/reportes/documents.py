"""PDF and Excel versions of the reports. Both are drawn from the same sections, so their content cannot differ.

Names, reasons and quotes come from supplier documents. In Excel every text is stored as text, never as a formula;
in PDF it is escaped, so it cannot inject markup.
"""

from __future__ import annotations

import io
import re
import unicodedata
from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal
from typing import Any
from xml.sax.saxutils import escape

from openpyxl import Workbook
from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Flowable, LongTable, Paragraph, SimpleDocTemplate, Spacer, TableStyle

Value = str | Decimal | int | None
_ACCENT = "0F6E8C"
_MAX_CELL = 2000
_MONEY_FORMAT = "#,##0.00"
_SHEET_FORBIDDEN = re.compile(r"[\[\]:*?/\\]")


@dataclass(frozen=True, slots=True)
class Section:
    title: str  # also the sheet name in Excel
    header: tuple[str, ...] = ()
    rows: Sequence[Sequence[Value]] = ()
    notes: tuple[str, ...] = ()
    widths: tuple[int, ...] = ()  # relative column widths


@dataclass(frozen=True, slots=True)
class ReportDocument:
    title: str
    sections: tuple[Section, ...]
    footer: str = "Resultados automáticos: verifíquelos contra los documentos. La adjudicación la decide el comité."


def _clean(text: str) -> str:
    return str(ILLEGAL_CHARACTERS_RE.sub("", " ".join(text.split())))[:_MAX_CELL]


# ---------- Excel ----------
def render_xlsx(document: ReportDocument) -> bytes:
    book = Workbook()
    book.remove(book.active)
    used: set[str] = set()
    for section in document.sections:
        name = _SHEET_FORBIDDEN.sub(" ", section.title)[:28] or "Hoja"
        while name.lower() in used:
            name = f"{name[:26]} {len(used)}"
        used.add(name.lower())
        sheet = book.create_sheet(name)

        def write(row: int, column: int, value: Value, sheet: Any = sheet) -> Any:
            cell = sheet.cell(row=row, column=column)
            if isinstance(value, str):
                cell.value = _clean(value)
                cell.data_type = "s"  # "=1+1" from a supplier stays text
            else:
                cell.value = value
                if isinstance(value, Decimal):
                    cell.number_format = _MONEY_FORMAT
            cell.alignment = Alignment(vertical="top", wrap_text=True)
            return cell

        write(1, 1, f"{document.title} · {section.title}").font = Font(bold=True, size=13, color=_ACCENT)
        sheet.cell(row=1, column=1).alignment = Alignment(vertical="top")
        row = 3
        for note in section.notes:
            write(row, 1, note).alignment = Alignment(vertical="top")
            row += 1
        if section.header:
            row += 1 if section.notes else 0
            for column, title in enumerate(section.header, start=1):
                cell = write(row, column, title)
                cell.font = Font(bold=True, color="FFFFFF")
                cell.fill = PatternFill("solid", fgColor=_ACCENT)
            sheet.freeze_panes = sheet.cell(row=row + 1, column=1)
            first = row
            for values in section.rows:
                row += 1
                for column, value in enumerate(values, start=1):
                    write(row, column, value)
            sheet.auto_filter.ref = f"A{first}:{get_column_letter(len(section.header))}{max(row, first)}"
            row += 1
        widths = section.widths or tuple(1 for _ in section.header) or (6,)
        for column, weight in enumerate(widths, start=1):
            sheet.column_dimensions[get_column_letter(column)].width = max(14, min(70, 14 * weight))
        write(row + 1, 1, document.footer).alignment = Alignment(vertical="top")
        sheet.page_setup.orientation = "landscape"
        sheet.page_setup.fitToWidth, sheet.page_setup.fitToHeight = 1, 0
        sheet.sheet_properties.pageSetUpPr.fitToPage = True
    out = io.BytesIO()
    book.save(out)
    return out.getvalue()


# ---------- PDF ----------
def _printable(text: str) -> str:
    """The built-in PDF fonts cover Western European text; other characters are simplified instead of blanked."""
    out = []
    for char in _clean(text.replace("→", "->")):
        try:
            char.encode("cp1252")
            out.append(char)
        except UnicodeEncodeError:
            plain = unicodedata.normalize("NFKD", char).encode("ascii", "ignore").decode()
            out.append(plain or "?")
    return escape("".join(out))


def _shown(value: Value) -> str:
    if value is None:
        return "—"
    if isinstance(value, Decimal):
        return f"{value:,.2f}"
    return str(value)


def render_pdf(document: ReportDocument) -> bytes:
    styles = getSampleStyleSheet()
    body = ParagraphStyle("body", parent=styles["BodyText"], fontSize=9, leading=12)
    cell = ParagraphStyle("cell", parent=body, fontSize=8, leading=10)
    head = ParagraphStyle("head", parent=cell, fontName="Helvetica-Bold", textColor=colors.white)
    heading = ParagraphStyle("section", parent=styles["Heading2"], textColor=colors.HexColor(f"#{_ACCENT}"))
    heading.keepWithNext = 1
    out = io.BytesIO()
    pdf = SimpleDocTemplate(
        out, pagesize=landscape(A4), title=document.title, author="CotizAI",
        leftMargin=14 * mm, rightMargin=14 * mm, topMargin=14 * mm, bottomMargin=16 * mm,
    )  # fmt: skip
    story: list[Flowable] = [Paragraph(_printable(document.title), styles["Title"])]
    for section in document.sections:
        story.append(Paragraph(_printable(section.title), heading))
        story += [Paragraph(_printable(note), body) for note in section.notes]
        if not section.header:
            continue
        if not section.rows:
            story.append(Paragraph("Sin datos.", body))
            continue
        weights = section.widths or tuple(1 for _ in section.header)
        widths = [pdf.width * w / sum(weights) for w in weights]
        data = [[Paragraph(_printable(t), head) for t in section.header]]
        data += [[Paragraph(_printable(_shown(v)), cell) for v in row] for row in section.rows]
        if section.title == "Conformidad del comité":  # room to sign by hand
            data[1:] = [[*row[:-1], [row[-1], Spacer(1, 12 * mm)]] for row in data[1:]]
        table = LongTable(data, colWidths=widths, repeatRows=1, splitInRow=1)
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(f"#{_ACCENT}")),
                    ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#C9D8DE")),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F2F8FA")]),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ]
            )
        )
        story += [Spacer(1, 2 * mm), table]
    story += [Spacer(1, 6 * mm), Paragraph(_printable(document.footer), body)]

    def number_page(canvas: Any, doc: Any) -> None:
        canvas.setFont("Helvetica", 8)
        canvas.drawRightString(doc.pagesize[0] - 14 * mm, 8 * mm, f"Página {doc.page}")

    pdf.build(story, onFirstPage=number_page, onLaterPages=number_page)
    return out.getvalue()
