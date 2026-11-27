"""Markdown del reporte. Todo texto de propuesta se escapa: ni HTML ni enlaces ni tablas rotas."""

from __future__ import annotations

import re

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
    is_plain_decimal,
    money,
    one_line,
    warnings,
)

_SPECIAL = re.compile(r"([\\`*_{}\[\]<>()#|&~!])")
_LINE_START = re.compile(r"^(\s*)([+\-.]|\d+[.)])")


def esc(text: str | None, limit: int | None = None) -> str:
    t = clip(text, limit) if limit else one_line(text)
    if is_plain_decimal(t):  # una cifra no necesita escape y debe verse tal cual
        return t
    t = _SPECIAL.sub(r"\\\1", t)
    return _LINE_START.sub(lambda m: m.group(1) + "\\" + m.group(2), t)  # «- x» / «1. x» no inician listas


def _row(*cells: str) -> str:
    return "| " + " | ".join(cells) + " |"


def _table(header: list[str], rows: list[list[str]]) -> list[str]:
    return [_row(*header), _row(*["---"] * len(header)), *(_row(*r) for r in rows), ""]


def _cover(m: ReportModel, evaluation_id: str) -> list[str]:
    return [
        "# Reporte de evaluación de propuestas",
        "",
        f"- **Proyecto:** {esc(m.project_name)}",
        f"- **Fecha:** {m.generated}",
        f"- **Margen de equivalencia técnica (δ):** {esc(m.delta)} puntos",
        f"- **Evaluación:** {esc(evaluation_id)}",
        "",
    ]


def _recommended(m: ReportModel) -> list[str]:
    out = ["## Recomendada", ""]
    if m.recommended is None:
        return [*out, "**Ninguna propuesta válida.**", "", esc(m.motive), ""]
    p = m.recommended
    out += [f"**{esc(p.supplier or p.id)}** (`{esc(p.id)}`)", ""]
    out += [
        f"- Puntaje técnico: {esc(p.score)}",
        f"- Costo real: {esc(p.currency)} {esc(money(p.cost.total))}".rstrip(),
    ]
    return [*out, "", esc(m.motive), ""]


def _ranking(m: ReportModel) -> list[str]:
    rows = [
        [str(r.position), esc(r.proposal.supplier or r.proposal.id), esc(r.proposal.id),
         VERDICT_LABEL[r.proposal.verdict], esc(r.proposal.score) or "—", esc(r.proposal.currency) or "—",
         esc(money(r.proposal.cost.total))]
        for r in m.classified
    ]  # fmt: skip
    head = ["#", "Proveedor", "Propuesta", "Veredicto", "Puntaje", "Moneda", "Costo real"]
    return ["## Ranking", "", *(_table(head, rows) if rows else ["_Sin propuestas clasificadas._", ""])]


def _matrix(m: ReportModel) -> list[str]:
    rows = []
    for r in m.classified:
        c = r.proposal.criteria
        if c:
            rows.append([esc(r.proposal.supplier or r.proposal.id), *(
                f"{getattr(c, key).score} — {esc(' · '.join(getattr(c, key).evidence), 500)}" for key, _ in CRITERIA
            )])  # fmt: skip
    if not rows:
        return []
    return ["## Matriz de criterios (0–100)", "", *_table(["Propuesta", *(label for _, label in CRITERIA)], rows)]


def _discards(m: ReportModel) -> list[str]:
    if not m.discarded:
        return []
    out = ["## Descartadas", ""]
    for p in m.discarded:
        out += [f"### {esc(p.supplier or p.id)} (`{esc(p.id)}`)", ""]
        for f in discarding(p):
            out += [
                f"- **{f.code.value}** — {esc(cause_label(f.code.value))} (origen: {ORIGIN_LABEL.get(f.origin.value)})",
                f"  - Motivo: {esc(f.reason)}",
                f"  - Cita: «{esc(f.evidence, 500)}»",
            ]
        out.append("")
    return out


def _breakdown(m: ReportModel) -> list[str]:
    out = ["## Desglose por propuesta", ""]
    for r in m.ranked:
        p = r.proposal
        out += [f"### {esc(p.supplier or p.id)} — {VERDICT_LABEL[p.verdict]}", ""]
        for f in warnings(p):
            out.append(f"- Aviso **{f.code.value}**: {esc(f.reason)} (cita: «{esc(f.evidence, 500)}»)")
        steps = [[esc(s.item), esc(money(s.amount)), esc(s.detail, 500)] for s in p.cost.steps]
        out += ["", "**Costo real paso a paso**", "", *_table(["Concepto", "Monto", "Origen"], steps)]
        out += [f"Total: **{esc(money(p.cost.total))}**", ""]
        if p.lines:
            rows = [
                [esc(li.description), esc(amount_literal(li, "quantity")), esc(amount_literal(li, "unit_price")),
                 esc(amount_literal(li, "line_total")), esc(li.evidence.page_or_cell), esc(li.evidence.text, 500)]
                for li in p.lines
            ]  # fmt: skip
            head = ["Descripción", "Cant.", "Precio unit.", "Total", "Ubicación", "Evidencia"]
            out += ["**Líneas**", "", *_table(head, rows)]
    return out


class MarkdownReport:
    def render(self, data: ReportInput) -> RenderedReport:
        m = build_model(data)
        lines = [*_cover(m, data.result.id), *_recommended(m), *_ranking(m), *_matrix(m), *_discards(m), *_breakdown(m)]
        if m.notes:
            lines += ["## Notas de revisión", "", *(f"- {esc(n)}" for n in m.notes), ""]
        return RenderedReport("\n".join(lines).encode("utf-8"), "text/markdown; charset=utf-8", "md")
