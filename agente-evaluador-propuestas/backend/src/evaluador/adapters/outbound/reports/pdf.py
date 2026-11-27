"""PDF con ReportLab y fuentes base-14 (sin red ni archivos externos).

ReportLab interpreta marcado en `Paragraph`: todo texto de propuesta se escapa. Los caracteres fuera de WinAnsi
(cp1252) se sustituyen por «?» porque la fuente base no los dibuja.
"""

from __future__ import annotations

import io
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from evaluador.application.use_cases.export_report import RenderedReport, ReportInput

from ._content import (
    CRITERIA,
    ORIGIN_LABEL,
    VERDICT_LABEL,
    ReportModel,
    amount_literal,
    build_model,
    cause_label,
    clip,
    discarding,
    money,
    one_line,
    warnings,
)

_STYLES = getSampleStyleSheet()
_BODY = ParagraphStyle("body", parent=_STYLES["BodyText"], fontSize=9, leading=12)
_CELL = ParagraphStyle("cell", parent=_BODY, fontSize=8, leading=10)
_H1 = ParagraphStyle("h1", parent=_STYLES["Heading1"], fontSize=18)
_H2 = ParagraphStyle("h2", parent=_STYLES["Heading2"], fontSize=13, spaceBefore=10)
_H3 = ParagraphStyle("h3", parent=_STYLES["Heading3"], fontSize=10, spaceBefore=6)


def safe(text: str | None, limit: int | None = None) -> str:
    """Texto seguro para `Paragraph`: sin marcado y solo con caracteres que la fuente base puede dibujar."""
    t = clip(text, limit) if limit else one_line(text)
    return escape(t.encode("cp1252", errors="replace").decode("cp1252"))


def _p(text: str | None, style: ParagraphStyle = _BODY, limit: int | None = None) -> Paragraph:
    return Paragraph(safe(text, limit), style)


def _table(header: list[str], rows: list[list[str]], widths: list[float] | None = None) -> Table:
    data = [[Paragraph(f"<b>{safe(h)}</b>", _CELL) for h in header]]
    data += [[_p(c, _CELL, 500) for c in row] for row in rows]
    t = Table(data, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#94A3B8")),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E2E8F0")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))  # fmt: skip
    return t


def _story(m: ReportModel, evaluation_id: str) -> list:  # type: ignore[type-arg]
    s: list = [  # type: ignore[type-arg]
        _p("Reporte de evaluación de propuestas", _H1),
        _p(f"Proyecto: {m.project_name}"),
        _p(f"Fecha: {m.generated}"),
        _p(f"Margen de equivalencia técnica (δ): {m.delta} puntos"),
        _p(f"Evaluación: {evaluation_id}"),
        _p("Recomendada", _H2),
    ]
    rec = m.recommended
    if rec is None:
        s += [_p("Ninguna propuesta válida."), _p(m.motive)]
    else:
        s += [_p(f"{rec.supplier or rec.id} ({rec.id})"), _p(f"Puntaje técnico: {rec.score}"),
              _p(f"Costo real: {rec.currency or ''} {money(rec.cost.total)}"), _p(m.motive)]  # fmt: skip
    s.append(_p("Ranking", _H2))
    rows = [[str(r.position), r.proposal.supplier or r.proposal.id, r.proposal.id, VERDICT_LABEL[r.proposal.verdict],
             r.proposal.score or "—", r.proposal.currency or "—", money(r.proposal.cost.total)]
            for r in m.classified]  # fmt: skip
    if rows:
        s.append(_table(["#", "Proveedor", "Propuesta", "Veredicto", "Puntaje", "Moneda", "Costo real"], rows,
                        [0.8 * cm, 3.6 * cm, 4.2 * cm, 2.6 * cm, 1.8 * cm, 1.5 * cm, 2.6 * cm]))  # fmt: skip
    matrix = [[r.proposal.supplier or r.proposal.id, *(
        f"{getattr(r.proposal.criteria, k).score} — {' · '.join(getattr(r.proposal.criteria, k).evidence)}"
        for k, _ in CRITERIA)] for r in m.classified if r.proposal.criteria]  # fmt: skip
    if matrix:
        s += [_p("Matriz de criterios (0–100)", _H2), _table(["Propuesta", *(lbl for _, lbl in CRITERIA)], matrix)]
    if m.discarded:
        s.append(_p("Descartadas", _H2))
        for p in m.discarded:
            s.append(_p(f"{p.supplier or p.id} ({p.id})", _H3))
            for f in discarding(p):
                s += [_p(f"{f.code.value} — {cause_label(f.code.value)} (origen: {ORIGIN_LABEL.get(f.origin.value)})"),
                      _p(f"Motivo: {f.reason}"), _p(f"Cita: «{f.evidence}»", limit=500)]  # fmt: skip
    s.append(_p("Desglose por propuesta", _H2))
    for r in m.ranked:
        p = r.proposal
        s.append(_p(f"{p.supplier or p.id} — {VERDICT_LABEL[p.verdict]}", _H3))
        s += [_p(f"Aviso {f.code.value}: {f.reason} (cita: «{f.evidence}»)", limit=500) for f in warnings(p)]
        steps = [[st.item, money(st.amount), st.detail] for st in p.cost.steps]
        s += [_table(["Concepto", "Monto", "Origen"], steps, [5 * cm, 3 * cm, 9 * cm]),
              _p(f"Total: {money(p.cost.total)}")]  # fmt: skip
        if p.lines:
            lines = [
                [
                    li.description,
                    amount_literal(li, "quantity"),
                    amount_literal(li, "unit_price"),
                    amount_literal(li, "line_total"),
                    li.evidence.page_or_cell,
                    li.evidence.text,
                ]
                for li in p.lines
            ]
            s += [Spacer(1, 4), _table(["Descripción", "Cant.", "Precio unit.", "Total", "Ubic.", "Evidencia"], lines)]
    if m.notes:
        s.append(_p("Notas de revisión", _H2))
        s += [_p(f"• {n}") for n in m.notes]
    return s


class PdfReport:
    def render(self, data: ReportInput) -> RenderedReport:
        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=1.5 * cm, rightMargin=1.5 * cm, topMargin=1.5 * cm,
                                bottomMargin=1.5 * cm, title="Reporte de evaluación", author="CotizAI")  # fmt: skip
        doc.build(_story(build_model(data), data.result.id))
        return RenderedReport(buf.getvalue(), "application/pdf", "pdf")
