"""XLSX con openpyxl. Política de celdas:

- Cifras (puntaje, montos): decimales simples validados -> celda NUMÉRICA con el formato de escala de la cadena
  original; lo indeterminado -> texto «No determinado» (nunca 0).
- Todo lo demás es texto: si empieza como fórmula se antepone `'` y el tipo de celda se fija en texto.
"""

from __future__ import annotations

import io
from decimal import Decimal

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.worksheet import Worksheet

from evaluador.application.use_cases.export_report import RenderedReport, ReportInput

from ._content import (
    CRITERIA,
    NO_VALID,
    NOT_DETERMINED,
    ORIGIN_LABEL,
    VERDICT_LABEL,
    ReportModel,
    amount_literal,
    build_model,
    cause_label,
    clip,
    discarding,
    is_plain_decimal,
    money,
    one_line,
    warnings,
)
from .csv_report import neutralize

MEDIA = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
_HEAD_FILL = PatternFill("solid", fgColor="E2E8F0")


def _cell_value(value: object) -> tuple[object, str | None]:
    """(valor, formato). Los textos se neutralizan; los decimales simples se escriben como número exacto."""
    if value is None:
        return "", None
    if isinstance(value, str):
        if is_plain_decimal(value):
            scale = len(value.split(".")[1]) if "." in value else 0
            return Decimal(value), "0" if scale == 0 else "0." + "0" * scale
        return neutralize(value), None
    return value, None


def _write(ws: Worksheet, rows: list[list[object]], header: list[str]) -> None:
    ws.append(header)
    for c in ws[1]:
        c.font, c.fill = Font(bold=True), _HEAD_FILL
    for row in rows:
        ws.append([_cell_value(v)[0] for v in row])
        for cell, raw in zip(ws[ws.max_row], row, strict=False):
            fmt = _cell_value(raw)[1]
            if fmt:
                cell.number_format = fmt
            elif isinstance(cell.value, str):
                cell.data_type = "s"  # nunca fórmula, ni siquiera por una neutralización omitida
                cell.alignment = Alignment(wrap_text=True, vertical="top")
    for i, col in enumerate(ws.columns, start=1):
        widest = max((len(str(c.value)) for c in col if c.value is not None), default=8)
        ws.column_dimensions[get_column_letter(i)].width = min(max(widest + 2, 10), 60)
    ws.freeze_panes = "A2"


def _summary(ws: Worksheet, m: ReportModel, evaluation_id: str) -> None:
    rec = m.recommended
    rows: list[list[object]] = [
        ["Proyecto", m.project_name],
        ["Fecha", m.generated],
        ["Margen de equivalencia técnica (δ)", m.delta],
        ["Evaluación", evaluation_id],
        ["Recomendada", (rec.supplier or rec.id) if rec else NO_VALID],
        ["Puntaje de la recomendada", rec.score if rec and rec.score else ""],
        ["Costo real de la recomendada", money(rec.cost.total) if rec else ""],
        ["Motivo", m.motive],
    ]
    rows += [["Nota de revisión", n] for n in m.notes]
    _write(ws, rows, ["Concepto", "Valor"])


def _ranking(ws: Worksheet, m: ReportModel) -> None:
    rows: list[list[object]] = []
    for r in m.ranked:
        p = r.proposal
        rows.append([
            "" if r.position is None else str(r.position), p.id, p.supplier or "", VERDICT_LABEL[p.verdict],
            p.score or "", p.currency or "", money(p.cost.total), ";".join(f.code.value for f in discarding(p)),
        ])  # fmt: skip
    _write(ws, rows, ["Posición", "Propuesta", "Proveedor", "Veredicto", "Puntaje", "Moneda", "Costo", "Causas"])


def _matrix(ws: Worksheet, m: ReportModel) -> None:
    rows: list[list[object]] = []
    for r in m.classified:
        c = r.proposal.criteria
        if c:
            for key, label in CRITERIA:
                crit = getattr(c, key)
                rows.append([r.proposal.id, label, str(crit.score), clip(" · ".join(crit.evidence))])
    _write(ws, rows, ["Propuesta", "Criterio", "Puntaje (0-100)", "Evidencia"])


def _discards(ws: Worksheet, m: ReportModel) -> None:
    rows: list[list[object]] = []
    for p in m.discarded:
        for f in discarding(p):
            rows.append([p.id, p.supplier or "", f.code.value, cause_label(f.code.value),
                         ORIGIN_LABEL.get(f.origin.value, ""), f.reason, clip(f.evidence)])  # fmt: skip
    for r in m.classified:
        for f in warnings(r.proposal):
            rows.append([r.proposal.id, r.proposal.supplier or "", f.code.value, "Aviso (no descarta)",
                         ORIGIN_LABEL.get(f.origin.value, ""), f.reason, clip(f.evidence)])  # fmt: skip
    _write(ws, rows, ["Propuesta", "Proveedor", "Código", "Causa", "Origen", "Motivo", "Cita"])


def _costs(ws: Worksheet, m: ReportModel) -> None:
    rows: list[list[object]] = []
    for r in m.ranked:
        p = r.proposal
        rows += [[p.id, s.item, money(s.amount), clip(s.detail)] for s in p.cost.steps]
        rows.append([p.id, "TOTAL", money(p.cost.total), p.currency or ""])
    _write(ws, rows, ["Propuesta", "Concepto", "Monto", "Origen / detalle"])


def _lines(ws: Worksheet, m: ReportModel) -> None:
    rows: list[list[object]] = []
    for r in m.ranked:
        for li in r.proposal.lines:
            rows.append([
                r.proposal.id, li.description, li.category,
                amount_literal(li, "quantity"), amount_literal(li, "unit_price"), amount_literal(li, "line_total"),
                li.line_total.value if li.line_total else NOT_DETERMINED,
                one_line(li.evidence.page_or_cell), clip(li.evidence.text),
            ])  # fmt: skip
    _write(ws, rows, ["Propuesta", "Descripción", "Categoría", "Cantidad", "Precio unitario", "Total línea (literal)",
                      "Total línea (valor)", "Ubicación", "Evidencia"])  # fmt: skip


class XlsxReport:
    def render(self, data: ReportInput) -> RenderedReport:
        m = build_model(data)
        wb = Workbook()
        wb.remove(wb.active)
        for name, fill in (("Resumen", None), ("Ranking", _ranking), ("Matriz", _matrix),
                           ("Descartes", _discards), ("Costos", _costs), ("Líneas", _lines)):  # fmt: skip
            ws = wb.create_sheet(name)
            if fill is None:
                _summary(ws, m, data.result.id)
            else:
                fill(ws, m)
        buf = io.BytesIO()
        wb.save(buf)
        return RenderedReport(buf.getvalue(), MEDIA, "xlsx")
