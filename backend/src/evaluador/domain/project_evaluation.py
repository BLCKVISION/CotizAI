"""Persisted result of evaluating every proposal of a project. A snapshot: it never changes after being saved."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from .decision_trace import TraceStep


@dataclass(frozen=True, slots=True)
class ProposalFindingSummary:
    code: str
    severity: str
    discards: bool
    reason: str
    evidence: str
    origin: str


@dataclass(frozen=True, slots=True)
class CostStepSummary:
    concept: str
    amount: Decimal | None  # None = announced but not determined; never treated as zero
    detail: str = ""


@dataclass(frozen=True, slots=True)
class CriterionScore:
    criterion: str
    score: int
    weight: int
    evidence: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class QuotedLine:
    """One line of a quote as it was read; amounts that were not legible stay None."""

    description: str
    category: str
    quantity: Decimal | None
    unit_price: Decimal | None
    line_total: Decimal | None


@dataclass(frozen=True, slots=True)
class ProposalEvaluationItem:
    proposal_id: str
    filename: str
    verdict: str
    score: Decimal | None
    real_cost: Decimal | None
    currency: str | None
    converted_cost: Decimal | None
    converted_currency: str | None
    findings: tuple[ProposalFindingSummary, ...]
    supplier: str | None = None
    cost_steps: tuple[CostStepSummary, ...] = ()
    criteria: tuple[CriterionScore, ...] = ()
    reading_warnings: tuple[str, ...] = ()
    over_budget: bool = False
    supplier_history: tuple[str, ...] = ()  # earlier discards of the same supplier in this organisation
    evaluated_at: datetime | None = None  # when this proposal was read; a selective run keeps the older ones
    unverified: tuple[str, ...] = ()  # control questions without enough data to answer
    trace: tuple[TraceStep, ...] = ()  # absent in older results
    lines: tuple[QuotedLine, ...] = ()  # absent in older results
    terms: tuple[str, ...] = ()  # warranty and support as written in the quote


@dataclass(frozen=True, slots=True)
class ReviewDecision:
    """A person's yes or no on the AI's result for one proposal. It only holds for the reading it reviewed."""

    id: str  # "<project_id>.<proposal_id>": one current decision per proposal
    tenant_id: str
    project_id: str
    proposal_id: str
    approved: bool
    comment: str
    decided_by: str
    creado: datetime
    reviewed_reading: datetime | None  # `evaluated_at` of the item the person looked at


@dataclass(frozen=True, slots=True)
class ExchangeRateSnapshot:
    base: str
    quote: str
    value: Decimal
    source: str
    effective_date: str
    origin: str


@dataclass(frozen=True, slots=True)
class ProjectEvaluation:
    """`id` equals the project id (one current evaluation per project); `id`, `tenant_id` and `creado` are the
    attributes every stored collection relies on."""

    id: str
    tenant_id: str
    project_id: str
    evaluated_by: str
    creado: datetime
    target_currency: str
    ranking: tuple[str, ...]
    items: tuple[ProposalEvaluationItem, ...]
    exchange_rates: tuple[ExchangeRateSnapshot, ...] = ()
    warnings: tuple[str, ...] = ()
