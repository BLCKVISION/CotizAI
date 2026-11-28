from datetime import UTC, datetime
from decimal import Decimal

from evaluador.adapters.outbound.reportes.assistant_report import ReportFileRenderer
from evaluador.adapters.outbound.reportes.decision_sections import headline, summarise
from evaluador.domain.project_evaluation import ProjectEvaluation, ProposalEvaluationItem, ReviewDecision

NOW = datetime(2026, 11, 27, tzinfo=UTC)


def _item(proposal_id: str, verdict: str, cost: str) -> ProposalEvaluationItem:
    return ProposalEvaluationItem(
        proposal_id=proposal_id, filename=f"{proposal_id}.pdf", verdict=verdict, score=Decimal("80"),
        real_cost=Decimal(cost), currency="USD", converted_cost=None, converted_currency=None, findings=(),
        supplier=f"Proveedor {proposal_id}",
    )  # fmt: skip


def _evaluation() -> ProjectEvaluation:
    items = (_item("a", "valida", "100"), _item("b", "valida", "90"))
    return ProjectEvaluation("p", "t", "p", "u", NOW, "USD", ("a", "b"), items)


def _rejection() -> ReviewDecision:
    return ReviewDecision("p.a", "t", "p", "a", False, "No cumple la entrega", "persona@example.org", NOW, None)


def test_a_rejection_moves_the_best_option_and_differences_follow_it() -> None:
    summary = summarise(_evaluation(), [_rejection()])
    assert summary.best is not None and summary.best.item.proposal_id == "b"
    assert [row.difference for row in summary.rows] == [Decimal("10"), Decimal("0")]
    assert "por ahora" in headline(summary)


def test_reports_carry_the_decision_and_comparison() -> None:
    renderer = ReportFileRenderer()
    markdown = renderer.evaluation(_evaluation(), "Proyecto", "md", [_rejection()]).decode()
    assert "## Decisión del comité" in markdown and "No cumple la entrega" in markdown
    assert renderer.evaluation(_evaluation(), "Proyecto", "pdf", [_rejection()]).startswith(b"%PDF")
    assert renderer.evaluation(_evaluation(), "Proyecto", "xlsx", [_rejection()]).startswith(b"PK")


def test_a_past_run_report_has_no_committee_section() -> None:
    markdown = ReportFileRenderer().evaluation(_evaluation(), "Proyecto", "md").decode()
    assert "Decisión del comité\n\n|" not in markdown
