"""Renderizadores de reportes: se parsea cada salida de vuelta y se comparan las cifras con el `ResultOut`."""

import csv
import io
import re
from decimal import Decimal

import pdfplumber
import pytest
from openpyxl import load_workbook

from evaluador.adapters.outbound.reports import RENDERERS
from evaluador.application.use_cases.export_report import ReportFormat, ReportInput
from tests.adapters._report_fixtures import (
    ALFA,
    BETA,
    DELTA,
    GAMA,
    MALICIOUS_SUPPLIER,
    full_result,
    no_valid_result,
)

PROJECT = "Laboratorio 11 PCs ñandú"
DECIMAL = re.compile(r"^-?\d+(\.\d+)?$")
FORMULA_START = re.compile(r"^[=+\-@\t\r]")


def render(fmt: ReportFormat, result=None, notes: tuple[str, ...] = ()):
    return RENDERERS[fmt].render(ReportInput(result or full_result(), PROJECT, notes))


def pdf_text(content: bytes) -> str:
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        return "\n".join(p.extract_text() or "" for p in pdf.pages)


def test_registry_has_every_format_with_expected_media_type():
    assert set(RENDERERS) == set(ReportFormat)
    assert render(ReportFormat.PDF).media_type == "application/pdf"
    assert render(ReportFormat.MD).media_type.startswith("text/markdown")
    assert render(ReportFormat.CSV).media_type.startswith("text/csv")
    assert "spreadsheetml" in render(ReportFormat.XLSX).media_type
    assert {f: render(f).extension for f in ReportFormat} == {
        ReportFormat.PDF: "pdf", ReportFormat.MD: "md", ReportFormat.CSV: "csv", ReportFormat.XLSX: "xlsx",
    }  # fmt: skip


# ---------------- CSV ----------------
def csv_rows(result=None) -> list[list[str]]:
    r = render(ReportFormat.CSV, result)
    assert r.content.startswith(b"\xef\xbb\xbf"), "UTF-8 con BOM para Excel"
    return list(csv.reader(io.StringIO(r.content.decode("utf-8-sig"))))


def test_csv_has_one_row_per_proposal_with_exact_figures():
    rows = csv_rows()
    header, body = rows[0], rows[1:]
    assert len(body) == 5
    col = {name: i for i, name in enumerate(header)}
    by_id = {row[col["Propuesta"]]: row for row in body}
    assert by_id[BETA.id][col["Puntaje"]] == "86.00" and by_id[BETA.id][col["Costo"]] == "10450.00"
    assert by_id[ALFA.id][col["Puntaje"]] == "88.5" and by_id[ALFA.id][col["Costo"]] == "10900"  # sin reformatear
    assert by_id[BETA.id][col["Moneda"]] == "USD"


def test_csv_indeterminate_cost_is_never_zero_and_position_follows_ranking():
    rows = csv_rows()
    col = {name: i for i, name in enumerate(rows[0])}
    by_id = {row[col["Propuesta"]]: row for row in rows[1:]}
    assert by_id[GAMA.id][col["Costo"]] == "No determinado" and by_id[GAMA.id][col["Puntaje"]] == ""
    assert [by_id[p.id][col["Posición"]] for p in (BETA, ALFA, GAMA)] == ["1", "2", "3"]
    assert by_id[DELTA.id][col["Posición"]] == "" and by_id[DELTA.id][col["Causas"]] == "ARITMETICA"


def test_csv_neutralizes_formula_injection_but_keeps_numbers():
    rows = csv_rows()
    flat = [c for row in rows for c in row]
    assert "'" + MALICIOUS_SUPPLIER in flat
    for cell in flat:
        assert DECIMAL.match(cell) or not FORMULA_START.match(cell), f"celda peligrosa: {cell!r}"


def test_csv_with_no_valid_proposal_still_lists_everyone():
    assert len(csv_rows(no_valid_result())) == 3


# ---------------- XLSX ----------------
def workbook(result=None):
    return load_workbook(io.BytesIO(render(ReportFormat.XLSX, result).content))


def sheet_rows(ws) -> list[list]:
    return [[c.value for c in row] for row in ws.iter_rows()]


def test_xlsx_has_the_required_sheets():
    assert workbook().sheetnames == ["Resumen", "Ranking", "Matriz", "Descartes", "Costos", "Líneas"]


def test_xlsx_ranking_figures_match_result_exactly():
    rows = sheet_rows(workbook()["Ranking"])
    col = {name: i for i, name in enumerate(rows[0])}
    by_id = {r[col["Propuesta"]]: r for r in rows[1:]}
    assert Decimal(str(by_id[BETA.id][col["Puntaje"]])) == Decimal(BETA.score or "")
    assert Decimal(str(by_id[BETA.id][col["Costo"]])) == Decimal(BETA.cost.total or "")
    assert Decimal(str(by_id[ALFA.id][col["Costo"]])) == Decimal("10900")
    assert by_id[GAMA.id][col["Costo"]] == "No determinado"  # nunca 0
    assert by_id[GAMA.id][col["Puntaje"]] in (None, "")


def test_xlsx_never_contains_formulas_and_prefixes_dangerous_text():
    wb = workbook()
    values = []
    for ws in wb.worksheets:
        for row in ws.iter_rows():
            for c in row:
                assert c.data_type != "f", f"fórmula en {ws.title}!{c.coordinate}: {c.value!r}"
                values.append(c.value)
    assert "'" + MALICIOUS_SUPPLIER in values
    for v in values:
        if isinstance(v, str) and FORMULA_START.match(v):
            assert DECIMAL.match(v), f"texto peligroso sin neutralizar: {v!r}"


def test_xlsx_discards_truncate_evidence_and_keep_non_ascii():
    wb = workbook()
    flat = [str(c) for ws in wb.worksheets for row in sheet_rows(ws) for c in row if c is not None]
    assert any("ARITMETICA" in c for c in flat) and any("MANIPULACION" in c for c in flat)
    assert max(len(c) for c in flat if set(c) == {"Z"} or c.startswith("ZZZ")) <= 501
    assert any("Teclado español ñ áéíóú" in c for c in flat)


def test_xlsx_costs_and_lines_sheets_carry_steps_and_evidence():
    costs = sheet_rows(workbook()["Costos"])
    assert any(r[1] == "Instalación" and Decimal(str(r[2])) == Decimal("220.00") for r in costs[1:])
    assert any(r[1] == "Monto base" and r[2] == "No determinado" for r in costs[1:])
    lines = sheet_rows(workbook()["Líneas"])
    assert any("p.1" in str(c) for r in lines[1:] for c in r)


def test_xlsx_summary_reports_recommended_and_none_case():
    flat = [str(c) for row in sheet_rows(workbook()["Resumen"]) for c in row if c is not None]
    assert any("Beta Soluciones S.A." in c for c in flat) and any(PROJECT in c for c in flat)
    none_flat = [str(c) for row in sheet_rows(workbook(no_valid_result())["Resumen"]) for c in row if c is not None]
    assert any("Ninguna propuesta válida" in c for c in none_flat)


# ---------------- Markdown ----------------
def markdown(result=None, notes: tuple[str, ...] = ()) -> str:
    return render(ReportFormat.MD, result, notes).content.decode("utf-8")


def md_tables(md: str) -> list[list[str]]:
    tables: list[list[str]] = []
    current: list[str] = []
    for line in md.splitlines():
        if line.startswith("|"):
            current.append(line)
        elif current:
            tables.append(current)
            current = []
    if current:
        tables.append(current)
    return tables


def test_markdown_shows_recommended_ranking_and_exact_figures():
    md = markdown()
    lines = [line.replace("\\", "") for line in md.splitlines()]  # sin las barras de escape de Markdown
    assert PROJECT in md and "Beta Soluciones S.A." in md
    ranking_row = next(line for line in lines if BETA.id in line and "86.00" in line)
    assert "10450.00" in ranking_row and "USD" in ranking_row
    assert any(ALFA.id in line and "88.5" in line and "10900" in line for line in lines)
    assert "No determinado" in next(line for line in lines if GAMA.id in line)


def test_markdown_escapes_html_pipes_and_keeps_tables_well_formed():
    md = markdown()
    assert "<b>" not in md and "<i>" not in md and "<script" not in md
    for table in md_tables(md):
        counts = {len(re.split(r"(?<!\\)\|", line)) for line in table}
        assert len(counts) == 1, f"tabla con columnas desiguales: {table}"
    assert "\n\n#" not in md.replace("\n\n# ", "").replace("\n\n## ", "").replace("\n\n### ", "")


def test_markdown_discards_cite_code_reason_and_clipped_evidence():
    md = markdown()
    assert "ARITMETICA" in md and "MANIPULACION" in md
    assert "Z" * 501 not in md and "Z" * 400 in md
    assert "Teclado español ñ" in md


def test_markdown_without_valid_and_with_notes():
    md = markdown(no_valid_result(), notes=("Revisado por el comité", "Segunda nota"))
    assert "Ninguna propuesta válida" in md
    assert "Revisado por el comité" in md and "Segunda nota" in md


# ---------------- PDF ----------------
def test_pdf_is_a_pdf_with_exact_figures_and_literal_markup():
    r = render(ReportFormat.PDF)
    assert r.content.startswith(b"%PDF")
    text = pdf_text(r.content)
    for expected in ("86.00", "10450.00", "88.5", "10900", "No determinado", "ARITMETICA", "MANIPULACION"):
        assert expected in text, expected
    assert "10,900" not in text and "88.50" not in text
    assert "<b>x</b>" in text, "el marcado malicioso se muestra como texto, no se interpreta"
    assert "Teclado español ñ" in text and PROJECT in text


def test_pdf_clips_evidence_and_handles_no_valid():
    text = pdf_text(render(ReportFormat.PDF).content)
    assert 400 <= text.count("Z") <= 520
    assert "Ninguna propuesta válida" in pdf_text(render(ReportFormat.PDF, no_valid_result()).content)


def test_pdf_survives_characters_outside_the_base_font():
    from tests.adapters._report_fixtures import make_result

    odd = BETA.model_copy(update={"supplier": "Proveedor → ✓ 日本 ñ"})
    text = pdf_text(render(ReportFormat.PDF, make_result(odd)).content)
    assert "Proveedor" in text and "ñ" in text


@pytest.mark.parametrize("fmt", list(ReportFormat))
def test_every_format_renders_a_result_with_no_proposals(fmt):
    from tests.adapters._report_fixtures import make_result

    assert render(fmt, make_result()).content
