"""Report files (PDF, Excel, Markdown, CSV) for the download button and the assistant.

Code builds them from stored data; the model writes none of their content.
"""

from __future__ import annotations

import csv
import io
from collections.abc import Sequence
from decimal import Decimal
from typing import Any

from evaluador.adapters.outbound.reportes.decision_sections import (
    DecisionSummary,
    decision_label,
    headline,
    summarise,
)
from evaluador.adapters.outbound.reportes.documents import ReportDocument, Section, render_pdf, render_xlsx
from evaluador.adapters.outbound.reportes.evaluation_report import (
    _CRITERIA,
    _UNVERIFIED,
    _VERDICTS,
    _cell,
    _money,
    _text,
    render_csv_report,
    render_markdown_report,
)
from evaluador.application.ports.assistant import ReportFormat
from evaluador.domain.assistant.analysis import Comparison, Recommendation
from evaluador.domain.project_evaluation import ProjectEvaluation, ReviewDecision
from evaluador.domain.proyecto import Proyecto

_PRIORITIES = {"high": "Alta", "medium": "Media", "low": "Baja"}
_BOM = "﻿"  # lets Excel read accents


def _csv(header: Sequence[str], rows: Sequence[Sequence[object]]) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(header)
    for row in rows:
        writer.writerow([_cell(v) if isinstance(v, str) else ("" if v is None else str(v)) for v in row])
    return _BOM + buffer.getvalue()


def _table(header: Sequence[str], rows: Sequence[Sequence[str]]) -> list[str]:
    lines = ["| " + " | ".join(header) + " |", "|" + "---|" * len(header)]
    return lines + ["| " + " | ".join(row) + " |" for row in rows]


def _amount(value: Decimal | None, currency: str | None) -> str:
    return _money(value, currency) if value is not None else "—"


def _encode(text: str) -> bytes:
    return text.encode()


def _binary(document: ReportDocument, fmt: ReportFormat) -> bytes:
    return render_pdf(document) if fmt == "pdf" else render_xlsx(document)


_DECISION_HEADER = ("Propuesta", "Resultado de la IA", "Decisión del comité", "Comentario", "Verificó", "Fecha")
_COMPARISON_HEADER = ("Puesto", "Proveedor", "Mejor", "Decisión", "Puntaje", "Costo comparable", "Dif. con la mejor")


def _decision_rows(summary: DecisionSummary) -> list[tuple[str, ...]]:
    return [
        (
            r.item.supplier or r.item.filename,
            _VERDICTS.get(r.item.verdict, r.item.verdict),
            decision_label(r.decision),
            r.decision.comment if r.decision else "",
            r.decision.decided_by if r.decision else "",
            r.decision.creado.isoformat(timespec="minutes") if r.decision else "",
        )
        for r in summary.rows
    ]


def _decision_markdown(summary: DecisionSummary, currency: str) -> str:
    comparison = [
        [
            str(r.position),
            _text(r.item.supplier or r.item.filename),
            "Sí" if r.is_best else "",
            decision_label(r.decision),
            str(r.item.score) if r.item.score is not None else "—",
            _amount(r.cost, currency),
            _amount(r.difference, currency),
        ]
        for r in summary.rows
    ]
    decisions = [[_text(value) or "—" for value in row] for row in _decision_rows(summary)]
    lines = ["", "## Comparación para elegir la mejor", "", _text(headline(summary)), ""]
    lines += _table(_COMPARISON_HEADER, comparison)
    lines += ["", "## Decisión del comité", "", *_table(_DECISION_HEADER, decisions)]
    return "\n".join(lines) + "\n"


def _evaluation_document(
    evaluation: ProjectEvaluation, project_name: str, decisions: Sequence[ReviewDecision] | None
) -> ReportDocument:
    items = evaluation.items
    summary = summarise(evaluation, decisions or ())
    best = next((i for i in items if i.verdict == "valida"), None)
    recommendation = headline(summary) if decisions is not None else (
        f"Mejor propuesta válida: {best.supplier or best.filename}, con {best.score} puntos de 100."
        if best
        else "No hay propuestas válidas: no se emite recomendación."
    )
    notes = (
        f"Proyecto: {project_name}",
        f"Fecha de evaluación: {evaluation.creado.isoformat(timespec='seconds')}",
        f"Moneda de comparación: {evaluation.target_currency}",
        recommendation,
        *(f"Aviso: {w}" for w in evaluation.warnings),
    )
    observations: list[tuple[str, str]] = []
    for i in items:
        observations += [(i.filename, "Supera el presupuesto referencial del proyecto.")] if i.over_budget else []
        observations += [(i.filename, f"Antecedente: {h}") for h in i.supplier_history]
        if i.unverified:
            pending = "; ".join(_UNVERIFIED.get(code, code) for code in i.unverified)
            observations.append((i.filename, f"Sin verificar por falta de datos: {pending}."))
        observations += [(i.filename, f"Aviso de lectura: {w}") for w in i.reading_warnings]
    sections = [
        Section("Resumen", notes=notes),
        Section(
            "Comparación de propuestas",
            _COMPARISON_HEADER,
            [
                (r.position, r.item.supplier or r.item.filename, "Sí" if r.is_best else "", decision_label(r.decision),
                 r.item.score, r.cost, r.difference)
                for r in summary.rows
            ],
            notes=(
                f"Montos en {evaluation.target_currency}. Un valor positivo cuesta más que la mejor opción.",
                "La mejor opción es la primera del ranking aprobada por el comité o, si falta verificarla, válida.",
            ),
            widths=(1, 4, 1, 2, 1, 2, 2),
        ),
        Section("Decisión del comité", _DECISION_HEADER, _decision_rows(summary), widths=(3, 2, 2, 4, 3, 2)),
        Section(
            "Ranking",
            ("Puesto", "Archivo", "Proveedor", "Resultado", "Puntaje", "Moneda", "Costo real", "Costo convertido"),
            [
                (n, i.filename, i.supplier or "No identificado", _VERDICTS.get(i.verdict, i.verdict), i.score,
                 i.currency or "", i.real_cost, i.converted_cost)
                for n, i in enumerate(items, start=1)
            ],
            widths=(1, 4, 3, 2, 1, 1, 2, 2),
        ),
        Section(
            "Costo real paso a paso",
            ("Propuesta", "Concepto", "Monto", "Moneda", "Detalle"),
            [(i.filename, s.concept, s.amount, i.currency or "", s.detail) for i in items for s in i.cost_steps],
            widths=(3, 3, 2, 1, 5),
        ),
        Section(
            "Puntaje por criterio",
            ("Propuesta", "Criterio", "Puntaje", "Peso %", "Citas"),
            [
                (i.filename, _CRITERIA.get(c.criterion, c.criterion), c.score, c.weight, " | ".join(c.evidence))
                for i in items for c in i.criteria
            ],
            widths=(3, 3, 1, 1, 6),
        ),
        Section(
            "Hallazgos",
            ("Propuesta", "Código", "Efecto", "Origen", "Motivo", "Evidencia"),
            [
                (i.filename, f.code, "Descarta" if f.discards else f.severity, f.origin, f.reason, f.evidence)
                for i in items for f in i.findings
            ],
            widths=(3, 2, 1, 1, 4, 4),
        ),
        Section("Observaciones", ("Propuesta", "Observación"), observations, widths=(2, 5)),
        Section(
            "Tasas de cambio",
            ("Par", "Valor", "Origen", "Fuente", "Fecha valor"),
            [
                (f"{r.base}/{r.quote}", str(r.value), "BCV" if r.origin == "bcv" else "manual", r.source,
                 r.effective_date)
                for r in evaluation.exchange_rates
            ],
            notes=() if evaluation.exchange_rates else ("No se aplicó ninguna conversión de moneda.",),
        ),
    ]  # fmt: skip
    signatures = Section(
        "Conformidad del comité",
        ("Rol", "Nombre y apellido", "Firma", "Fecha"),
        [(role, " ", " ", " ") for role in ("Evaluador", "Aprobador", "Auditor")],
        widths=(2, 4, 4, 2),
    )
    if decisions is None:
        sections = [s for s in sections if s.title not in ("Comparación de propuestas", "Decisión del comité")]
    return ReportDocument("Informe de evaluación", (*sections, signatures))


class ReportFileRenderer:
    def evaluation(
        self,
        evaluation: ProjectEvaluation,
        project_name: str,
        fmt: ReportFormat,
        decisions: Sequence[ReviewDecision] | None = None,
    ) -> bytes:
        """`decisions=None` leaves the committee out, for reports of past runs that keep no decisions."""
        if fmt == "csv":
            return (_BOM + render_csv_report(evaluation)).encode()
        if fmt == "md":
            report = render_markdown_report(evaluation, project_name)
            if decisions is not None:
                report += _decision_markdown(summarise(evaluation, decisions), evaluation.target_currency)
            return report.encode()
        return _binary(_evaluation_document(evaluation, project_name, decisions), fmt)

    def comparison(self, comparison: Comparison, fmt: ReportFormat) -> bytes:
        if fmt in ("pdf", "xlsx"):
            table = Section(
                "Comparativa",
                ("Proyecto", "Proveedor", "Resultado", "Puntaje", "Moneda", "Costo real", "Frente a la referencia",
                 "Dif. %", "Frente al presupuesto"),
                [
                    (r.project_name, r.supplier or r.filename, _VERDICTS.get(r.verdict, r.verdict), r.score,
                     r.currency or "", r.cost, r.difference_vs_cheapest, r.percent_vs_cheapest, r.difference_vs_budget)
                    for r in comparison.rows
                ],
                notes=(
                    "Referencia: la propuesta válida más barata. Un valor negativo cuesta menos que la referencia "
                    "o queda por debajo del presupuesto.",
                    *comparison.notes,
                ),
                widths=(3, 3, 2, 1, 1, 2, 2, 1, 2),
            )  # fmt: skip
            reasons = Section(
                "Motivos de descarte",
                ("Propuesta", "Motivo"),
                [(r.filename, reason) for r in comparison.rows for reason in r.discard_reasons],
                widths=(2, 5),
            )
            return _binary(ReportDocument("Comparativa de presupuestos", (table, reasons)), fmt)
        if fmt == "csv":
            return _encode(_csv(
                ["proyecto", "archivo", "proveedor", "veredicto", "puntaje", "moneda", "costo",
                 "diferencia_con_referencia", "porcentaje_sobre_referencia", "diferencia_con_presupuesto",
                 "motivos_de_descarte"],
                [[r.project_name, r.filename, r.supplier or "", r.verdict, r.score, r.currency or "", r.cost,
                  r.difference_vs_cheapest, r.percent_vs_cheapest, r.difference_vs_budget,
                  "; ".join(r.discard_reasons)] for r in comparison.rows],
            ))  # fmt: skip
        rows = [
            [
                _text(r.project_name),
                _text(r.supplier or r.filename),
                _VERDICTS.get(r.verdict, r.verdict),
                str(r.score) if r.score is not None else "—",
                _amount(r.cost, r.currency),
                _amount(r.difference_vs_cheapest, r.currency),
                _amount(r.difference_vs_budget, r.currency),
            ]
            for r in comparison.rows
        ]
        lines = ["# Comparativa de presupuestos", ""]
        lines += _table(
            [
                "Proyecto",
                "Proveedor",
                "Resultado",
                "Puntaje",
                "Costo real",
                "Frente a la referencia",
                "Frente al presupuesto",
            ],
            rows,
        )
        if comparison.notes:
            lines += ["", "## Avisos", "", *(f"- {_text(n)}" for n in comparison.notes)]
        for r in comparison.rows:
            if r.discard_reasons:
                lines += ["", f"**{_text(r.filename)}**", "", *(f"- {_text(x)}" for x in r.discard_reasons)]
        lines += ["", "Resultados automáticos: verifíquelos contra los documentos. La adjudica el comité."]
        return _encode("\n".join(lines) + "\n")

    def recommendations(self, project: Proyecto, recommendations: Sequence[Recommendation], fmt: ReportFormat) -> bytes:
        if fmt in ("pdf", "xlsx"):
            section = Section(
                "Recomendaciones",
                ("Prioridad", "Acción", "Sustento"),
                [(_PRIORITIES.get(r.priority, r.priority), r.action, r.basis) for r in recommendations],
                notes=(f"Proyecto: {project.nombre}",),
                widths=(1, 4, 5),
            )
            footer = "Las recomendaciones son un apoyo: la adjudicación la decide el comité."
            return _binary(ReportDocument("Recomendaciones", (section,), footer), fmt)
        if fmt == "csv":
            return _encode(
                _csv(
                    ["prioridad", "accion", "sustento"],
                    [[_PRIORITIES.get(r.priority, r.priority), r.action, r.basis] for r in recommendations],
                )
            )
        lines = [f"# Recomendaciones — {_text(project.nombre)}", ""]
        for number, r in enumerate(recommendations, start=1):
            lines += [
                f"{number}. **[{_PRIORITIES.get(r.priority, r.priority)}]** {_text(r.action)}",
                f"   - Sustento: {_text(r.basis)}",
            ]
        lines += ["", "Las recomendaciones son un apoyo: la adjudicación la decide el comité."]
        return _encode("\n".join(lines) + "\n")

    def portfolio(self, rows: Sequence[dict[str, Any]], fmt: ReportFormat) -> bytes:
        def best(row: dict[str, Any]) -> dict[str, Any]:
            return row.get("best_valid") or {}

        if fmt in ("pdf", "xlsx"):
            section = Section(
                "Presupuestos",
                ("Proyecto", "Estado", "Moneda", "Presupuesto", "Evaluadas", "Mejor válida", "Costo",
                 "Moneda del costo"),
                [
                    (r["name"], r["status"].replace("_", " "), r["currency"], r["reference_budget"],
                     r.get("proposals_evaluated", 0), best(r).get("supplier") or "—", best(r).get("cost"),
                     best(r).get("currency") or "")
                    for r in rows
                ],
                widths=(4, 3, 1, 2, 1, 3, 2, 1),
            )  # fmt: skip
            return _binary(ReportDocument("Presupuestos de la organización", (section,)), fmt)
        if fmt == "csv":
            return _encode(_csv(
                ["proyecto", "estado", "moneda", "presupuesto_referencial", "evaluado", "propuestas_evaluadas",
                 "mejor_proveedor_valido", "costo_mejor_valida", "moneda_costo"],
                [[r["name"], r["status"], r["currency"], r["reference_budget"], "si" if r["evaluated"] else "no",
                  r.get("proposals_evaluated", 0), best(r).get("supplier") or "", best(r).get("cost"),
                  best(r).get("currency") or ""] for r in rows],
            ))  # fmt: skip
        table = [
            [
                _text(r["name"]),
                _text(r["status"].replace("_", " ")),
                _amount(r["reference_budget"], r["currency"]),
                str(r.get("proposals_evaluated", 0)),
                _text(best(r).get("supplier") or "—"),
                _amount(best(r).get("cost"), best(r).get("currency")),
            ]
            for r in rows
        ]
        lines = ["# Presupuestos de la organización", ""]
        lines += _table(["Proyecto", "Estado", "Presupuesto", "Evaluadas", "Mejor válida", "Costo"], table)
        return _encode("\n".join(lines) + "\n")
