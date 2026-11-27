"""Auditable Markdown and CSV reports for a stored project evaluation.

Filenames, reasons and quotes come from supplier documents: they are flattened and escaped so they cannot fake report
sections, inject markup or run as spreadsheet formulas.
"""

from __future__ import annotations

import csv
import io
import re
from decimal import Decimal

from evaluador.domain.project_evaluation import ProjectEvaluation, ProposalEvaluationItem

_VERDICTS = {"valida": "Válida", "descartada": "Descartada", "pendiente_de_revision": "Pendiente de revisión"}
_UNVERIFIED = {
    "CAPACIDAD": "que la energía soporte los equipos",
    "CALIDAD": "que los equipos sean nuevos",
}
_CRITERIA = {
    "rendimiento": "Rendimiento",
    "proteccion_y_perifericos": "Protección y periféricos",
    "garantia_y_soporte": "Garantía y soporte",
}
_MARKDOWN = re.compile(r"([\\`*_\[\]<>#|])")
_FORMULA_STARTS = ("=", "+", "-", "@", "\t", "\r")


def _text(value: str) -> str:
    return _MARKDOWN.sub(r"\\\1", " ".join(value.split()))


def _cell(value: str) -> str:
    flat = " ".join(value.split())
    return f"'{flat}" if flat.startswith(_FORMULA_STARTS) else flat


def _money(amount: Decimal | None, currency: str | None) -> str:
    return f"{currency or ''} {amount:,.2f}".strip() if amount is not None else "No determinado"


def _cost(item: ProposalEvaluationItem) -> str:
    original = _money(item.real_cost, item.currency)
    if item.converted_cost is None or item.converted_currency == item.currency:
        return original
    return f"{_money(item.converted_cost, item.converted_currency)} (original: {original})"


def _recommendation(evaluation: ProjectEvaluation) -> str:
    best = next((i for i in evaluation.items if i.verdict == "valida"), None)
    if best is None:
        return "No hay propuestas válidas: no se emite recomendación."
    who = f"{_text(best.filename)} ({_text(best.supplier)})" if best.supplier else _text(best.filename)
    return f"**{who}**, con {best.score} puntos de 100 y costo real {_cost(best)}."


def render_markdown_report(evaluation: ProjectEvaluation, project_name: str) -> str:
    lines = [
        f"# Informe de evaluación — {_text(project_name)}",
        "",
        f"- Proyecto: `{evaluation.project_id}`",
        f"- Fecha de evaluación: {evaluation.creado.isoformat(timespec='seconds')}",
        f"- Moneda de comparación: {evaluation.target_currency}",
        "",
        "## Recomendación",
        "",
        _recommendation(evaluation),
        "",
        "La recomendación es un apoyo: la adjudicación la decide el comité.",
        "",
    ]
    if evaluation.warnings:
        lines += ["## Avisos", "", *(f"- {_text(w)}" for w in evaluation.warnings), ""]
    lines += ["## Ranking final", ""]
    for position, item in enumerate(evaluation.items, start=1):
        score = f"{item.score:.2f}" if item.score is not None else "—"
        lines.append(
            f"{position}. **{_text(item.filename)}** — {_VERDICTS.get(item.verdict, item.verdict)} — "
            f"puntaje: {score} — costo real: {_cost(item)}"
        )

    lines += ["", "## Tasas de cambio aplicadas", ""]
    if evaluation.exchange_rates:
        lines += [
            f"- {r.base}/{r.quote} = {r.value} · {'BCV' if r.origin == 'bcv' else 'manual'} · "
            f"fuente: {_text(r.source)} · fecha valor: {r.effective_date}"
            for r in evaluation.exchange_rates
        ]
    else:
        lines.append("- No se aplicó ninguna conversión de moneda.")

    lines += ["", "## Detalle por propuesta", ""]
    for item in evaluation.items:
        lines += [f"### {_text(item.filename)} — {_VERDICTS.get(item.verdict, item.verdict)}", ""]
        lines.append(f"Proveedor: {_text(item.supplier) if item.supplier else 'no identificado'}")
        if item.over_budget:
            lines.append("Supera el presupuesto referencial del proyecto.")
        lines += [f"Antecedente: {_text(h)}" for h in item.supplier_history]
        if item.unverified:
            pending = "; ".join(_UNVERIFIED.get(code, code) for code in item.unverified)
            lines.append(f"Sin verificar por falta de datos: {pending}.")
        if item.cost_steps:
            lines += ["", "**Costo real, paso a paso**", ""]
            lines += [
                f"- {_text(s.concept)}: {_money(s.amount, item.currency)} ({_text(s.detail)})" for s in item.cost_steps
            ]
        if item.criteria:
            lines += ["", "**Puntaje por criterio**", ""]
            for c in item.criteria:
                lines.append(f"- {_CRITERIA.get(c.criterion, c.criterion)}: {c.score}/100 (peso {c.weight} %)")
                lines += [f"  - Cita: «{_text(q)}»" for q in c.evidence]
        lines += ["", "**Hallazgos**", ""]
        if not item.findings:
            lines.append("- Sin hallazgos.")
        for f in item.findings:
            flag = "descarta" if f.discards else f.severity
            lines.append(f"- [{f.code} · {flag} · origen: {f.origin}] {_text(f.reason)}")
            if f.evidence:
                lines.append(f"  - Evidencia: «{_text(f.evidence)}»")
        if item.reading_warnings:
            lines += ["", "**Avisos de lectura**", "", *(f"- {_text(w)}" for w in item.reading_warnings)]
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def render_csv_report(evaluation: ProjectEvaluation) -> str:
    """Ranked proposals, one row each."""
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        ["posicion", "archivo", "proveedor", "veredicto", "puntaje", "moneda_original", "costo_real",
         "moneda_convertida", "costo_convertido", "supera_presupuesto", "hallazgos"]
    )  # fmt: skip
    for position, item in enumerate(evaluation.items, start=1):
        writer.writerow([
            position,
            _cell(item.filename),
            _cell(item.supplier or ""),
            item.verdict,
            "" if item.score is None else str(item.score),
            item.currency or "",
            "" if item.real_cost is None else str(item.real_cost),
            item.converted_currency or "",
            "" if item.converted_cost is None else str(item.converted_cost),
            "si" if item.over_budget else "no",
            _cell("; ".join(f"[{f.code}] {f.reason}" for f in item.findings)),
        ])  # fmt: skip
    return buffer.getvalue()
