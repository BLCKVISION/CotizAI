"""Supplier text must stay inert inside the PDF and Excel files."""

from __future__ import annotations

import io
from decimal import Decimal

from evals.assistant.fixtures import report_text
from openpyxl import load_workbook

from evaluador.adapters.outbound.reportes.documents import ReportDocument, Section, render_pdf, render_xlsx

HOSTILE = ('=HYPERLINK("http://x.test","pagar")', "+1+1", "@SUM(A1)", "<font size=90><b>sin cerrar", "a\x00b → ✓ ñ")


def _document(rows):
    return ReportDocument("Informe: [prueba]/1", (Section("Hallazgos / [x]: *?", ("Texto", "Monto"), rows),))


def test_excel_never_turns_supplier_text_into_a_formula():
    content = render_xlsx(_document([(text, Decimal("14250.50")) for text in HOSTILE]))
    sheet = load_workbook(io.BytesIO(content)).active
    cells = [c for row in sheet.iter_rows() for c in row if c.value is not None]
    assert not [c for c in cells if c.data_type == "f"]
    assert HOSTILE[0] in [c.value for c in cells]
    assert 14250.5 in [c.value for c in cells]  # amounts stay numbers so they can be summed


def test_pdf_shows_markup_as_plain_text():
    text = report_text("pdf", render_pdf(_document([(t, Decimal("14250.50")) for t in HOSTILE])))
    assert "<font size=90>" in text
    assert "14,250.50" in text
    assert "ñ" in text


def test_a_long_report_spans_pages():
    rows = [(f"Fila {n} " + "texto largo " * 30, Decimal(n)) for n in range(120)]
    assert "Fila 119" in report_text("pdf", render_pdf(_document(rows)))
