"""Arma el `ResultOut` (contrato de `GET /evaluations/{id}`) a partir de lo que dejó el lote. Solo presenta:
no calcula ni decide; el veredicto, el puntaje y el costo ya vienen del código."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from evaluador.application.use_cases.batch import BatchResult
from evaluador.application.use_cases.evaluate_file import Evaluation
from evaluador.domain.cost import RealCost
from evaluador.domain.evaluation import FindingCode, Origin, Severity, Verdict
from evaluador.domain.extraction import Amount, Line
from evaluador.domain.result import (
    AmountOut,
    CostOut,
    CostStepOut,
    CriteriaOut,
    CriterionOut,
    EvidenceOut,
    FindingOut,
    LineOut,
    ProposalResultOut,
    ResultOut,
)
from evaluador.domain.score import ScoredRubric


def _amount(a: Amount | None) -> AmountOut | None:
    return AmountOut(literal=a.literal, value=a.value) if a is not None else None


def _line(ln: Line) -> LineOut:
    return LineOut(
        description=ln.description,
        category=ln.category,
        quantity=_amount(ln.quantity),
        unit_price=_amount(ln.unit_price),
        line_total=_amount(ln.line_total),
        evidence=EvidenceOut(page_or_cell=ln.evidence.page_or_cell, text=ln.evidence.text),
    )


def _cost(c: RealCost | None) -> CostOut:
    if c is None:
        return CostOut(total=None, steps=[])
    total = c.total
    steps = [
        CostStepOut(item=s.item, amount=None if s.amount is None else str(s.amount), detail=s.detail) for s in c.steps
    ]
    return CostOut(total=None if total is None else str(total), steps=steps)


def _criteria(r: ScoredRubric | None) -> CriteriaOut | None:
    if r is None:
        return None
    return CriteriaOut(
        performance=CriterionOut(score=r.performance.score, evidence=list(r.performance.evidence)),
        protection_and_peripherals=CriterionOut(
            score=r.protection_and_peripherals.score, evidence=list(r.protection_and_peripherals.evidence)
        ),
        warranty_and_support=CriterionOut(
            score=r.warranty_and_support.score, evidence=list(r.warranty_and_support.evidence)
        ),
    )


def _unreadable(proposal_id: str, file: str, error: str | None) -> ProposalResultOut:
    """Un archivo que no se pudo leer no es un error del proveedor: queda pendiente de revisión, con su aviso."""
    reason = "No se pudo leer el archivo de forma fiable." + (f" Motivo: {error}." if error else "")
    finding = FindingOut(
        code=FindingCode.LECTURA, severity=Severity.WARNING, discards=False, reason=reason, evidence=file,
        origin=Origin.RULE,
    )  # fmt: skip
    return ProposalResultOut(
        id=proposal_id, verdict=Verdict.PENDING_REVIEW, cost=CostOut(total=None, steps=[]), findings=[finding]
    )


def _proposal(
    proposal_id: str, file: str, error: str | None, verdict: Verdict, e: Evaluation | None
) -> ProposalResultOut:
    if e is None:
        return _unreadable(proposal_id, file, error)
    if verdict is Verdict.VALID and e.score is None:
        verdict = (
            Verdict.PENDING_REVIEW
        )  # válida sin puntaje: no se puede ordenar, va a revisión (igual que el ranking)
    extraction = e.result.extraction
    return ProposalResultOut(
        id=proposal_id,
        supplier=extraction.supplier if extraction else None,
        verdict=verdict,
        score=None if e.score is None else str(e.score),
        currency=(extraction.currency if extraction else None) or e.currency,
        criteria=_criteria(e.rubric),
        cost=_cost(e.cost),
        findings=[
            FindingOut(
                code=f.code, severity=f.severity, discards=f.discards, reason=f.reason, evidence=f.evidence,
                origin=f.origin,
            )
            for f in e.result.findings
        ],
        lines=[_line(ln) for ln in extraction.lines] if extraction else [],
    )  # fmt: skip


def build_result(*, job_id: str, project_id: str, generated: datetime, delta: Decimal, batch: BatchResult) -> ResultOut:
    proposals = [
        _proposal(p.proposal_id, p.file, p.error, p.verdict, batch.evaluations.get(p.proposal_id))
        for p in batch.processed
    ]
    return ResultOut(
        id=job_id,
        project_id=project_id,
        generated=generated,
        delta=str(delta),
        ranking=list(batch.ranking),
        proposals=proposals,
        status="done",
    )
