"""The committee's decision and the comparison that points to the best proposal. Code computes both; no model."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal

from evaluador.domain.project_evaluation import ProjectEvaluation, ProposalEvaluationItem, ReviewDecision


@dataclass(frozen=True, slots=True)
class ComparedProposal:
    position: int
    item: ProposalEvaluationItem
    decision: ReviewDecision | None
    cost: Decimal | None  # in the comparison currency
    difference: Decimal | None  # against the best option; positive means more expensive
    is_best: bool


@dataclass(frozen=True, slots=True)
class DecisionSummary:
    rows: tuple[ComparedProposal, ...]
    best: ComparedProposal | None
    pending: int  # proposals nobody has verified yet


def _comparable_cost(item: ProposalEvaluationItem, currency: str) -> Decimal | None:
    if item.converted_cost is not None:
        return item.converted_cost
    return item.real_cost if item.currency == currency else None


def summarise(evaluation: ProjectEvaluation, decisions: Sequence[ReviewDecision]) -> DecisionSummary:
    """Best option: the first in ranking order that the committee approved, or that is valid and not yet verified."""
    by_id = {d.proposal_id: d for d in decisions}

    def eligible(item: ProposalEvaluationItem) -> bool:
        decision = by_id.get(item.proposal_id)
        return decision.approved if decision else item.verdict == "valida"

    best = next((i for i in evaluation.items if eligible(i)), None)
    best_cost = _comparable_cost(best, evaluation.target_currency) if best else None
    rows = []
    for position, item in enumerate(evaluation.items, start=1):
        cost = _comparable_cost(item, evaluation.target_currency)
        difference = cost - best_cost if cost is not None and best_cost is not None else None
        rows.append(
            ComparedProposal(position, item, by_id.get(item.proposal_id), cost, difference, item is best)
        )
    return DecisionSummary(
        tuple(rows), next((r for r in rows if r.is_best), None), sum(1 for r in rows if r.decision is None)
    )


def headline(summary: DecisionSummary) -> str:
    if summary.best is None:
        return "No hay una propuesta que se pueda recomendar."
    item = summary.best.item
    score = f", con {item.score} puntos de 100" if item.score is not None else ""
    label = "Mejor opción por ahora" if summary.pending else "Mejor opción"
    pending = f" Faltan {summary.pending} por verificar." if summary.pending else ""
    return f"{label}: {item.supplier or item.filename}{score}.{pending}"


def decision_label(decision: ReviewDecision | None) -> str:
    if decision is None:
        return "Sin verificar"
    return "Aprobada" if decision.approved else "No aprobada"
