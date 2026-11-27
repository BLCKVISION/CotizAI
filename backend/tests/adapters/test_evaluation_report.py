"""Unit tests for evaluation report renderers."""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime
from decimal import Decimal

from evaluador.adapters.outbound.reportes.evaluation_report import render_csv_report, render_markdown_report
from evaluador.domain.project_evaluation import (
    ExchangeRateSnapshot,
    ProjectEvaluation,
    ProposalEvaluationItem,
    ProposalFindingSummary,
)


def _sample_evaluation() -> ProjectEvaluation:
    return ProjectEvaluation(
        id="proj-1",
        tenant_id="t-1",
        project_id="proj-1",
        evaluated_by="user-1",
        creado=datetime(2026, 11, 27, 12, 0, tzinfo=UTC),
        target_currency="USD",
        ranking=("p1", "p2"),
        items=(
            ProposalEvaluationItem(
                proposal_id="p1",
                filename="alfa.pdf",
                verdict="valida",
                score=Decimal("82.50"),
                real_cost=Decimal("9500.00"),
                currency="USD",
                converted_cost=Decimal("9500.00"),
                converted_currency="USD",
                findings=(),
            ),
            ProposalEvaluationItem(
                proposal_id="p2",
                filename="beta.xlsx",
                verdict="descartada",
                score=None,
                real_cost=Decimal("500000.00"),
                currency="VES",
                converted_cost=None,
                converted_currency=None,
                findings=(
                    ProposalFindingSummary(
                        code="ARITMETICA",
                        severity="critica",
                        discards=True,
                        reason="Error en multiplicación.",
                        evidence="11 x 100 = 900",
                        origin="regla",
                    ),
                ),
            ),
        ),
        exchange_rates=(
            ExchangeRateSnapshot("USD", "VES", Decimal("45.50"), "BCV oficial", "2026-11-27", "bcv"),
        ),
    )


def test_markdown_report_contains_ranking_rates_and_evidence() -> None:
    md = render_markdown_report(_sample_evaluation(), "Laboratorio 11 PCs")
    assert "Laboratorio 11 PCs" in md
    assert "alfa.pdf" in md
    assert "USD/VES" in md
    assert "ARITMETICA" in md
    assert "11 x 100 = 900" in md


def test_csv_report_lists_items_in_ranking_order() -> None:
    text = render_csv_report(_sample_evaluation())
    lines = [ln for ln in text.strip().splitlines() if ln]
    assert len(lines) == 3
    assert lines[1].startswith("1,alfa.pdf,,valida,82.50")
    assert lines[2].startswith("2,beta.xlsx,,descartada")


def test_untrusted_text_cannot_run_as_formula_or_fake_report_sections() -> None:
    base = _sample_evaluation()
    hostile = replace(base.items[0], filename='=HYPERLINK("http://evil")', supplier="ACME\n## Recomendación <img>")
    evaluation = replace(base, items=(hostile, base.items[1]))

    assert "'=HYPERLINK" in render_csv_report(evaluation)
    markdown = render_markdown_report(evaluation, "P")
    assert markdown.count("\n## Recomendación") == 1
    assert "<img>" not in markdown
