"""Comparisons and recommendations computed in code from stored evaluations, so no figure comes from a model."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from evaluador.domain.project_evaluation import ProjectEvaluation, ProposalEvaluationItem, ReviewDecision
from evaluador.domain.proyecto import Proyecto

VERDICT_VALID = "valida"
VERDICT_DISCARDED = "descartada"
VERDICT_PENDING = "pendiente_de_revision"
_CENTS = Decimal("0.01")


@dataclass(frozen=True, slots=True)
class ComparedProposal:
    project_id: str
    project_name: str
    proposal_id: str
    filename: str
    supplier: str | None
    verdict: str
    score: Decimal | None
    cost: Decimal | None
    currency: str | None
    difference_vs_cheapest: Decimal | None
    percent_vs_cheapest: Decimal | None
    budget: Decimal | None
    difference_vs_budget: Decimal | None  # positive = above the reference budget
    discard_reasons: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class Comparison:
    rows: tuple[ComparedProposal, ...]
    currency: str | None  # None when the costs cannot be compared
    notes: tuple[str, ...]


def comparable_cost(item: ProposalEvaluationItem) -> tuple[Decimal | None, str | None]:
    if item.converted_cost is not None:
        return item.converted_cost, item.converted_currency
    return item.real_cost, item.currency


def _percent(difference: Decimal, base: Decimal) -> Decimal | None:
    return (difference * 100 / base).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP) if base else None


def compare(entries: Sequence[tuple[Proyecto, ProposalEvaluationItem]]) -> Comparison:
    costs = [comparable_cost(item) for _, item in entries]
    currencies = {currency for cost, currency in costs if cost is not None}
    shared = next(iter(currencies)) if len(currencies) == 1 else None
    notes: list[str] = []
    if len(currencies) > 1:
        notes.append(
            f"Hay costos en monedas distintas ({', '.join(sorted(str(c) for c in currencies))}) sin una conversión "
            "registrada: no se calculan diferencias."
        )
    known = [cost for cost, _ in costs if cost is not None]
    # The reference is the cheapest eligible offer: a discarded one must not set the bar for the others.
    eligible = [
        c for (c, _), (_, i) in zip(costs, entries, strict=True) if c is not None and i.verdict == VERDICT_VALID
    ]
    cheapest = min(eligible or known) if shared and known else None
    if known and not eligible:
        notes.append("No hay propuestas válidas con costo: las diferencias son frente a la más barata, no elegible.")
    if any(cost is None for cost, _ in costs):
        notes.append("Alguna propuesta no tiene costo real determinado: no entra en las diferencias.")
    if any(item.verdict != VERDICT_VALID for _, item in entries):
        notes.append("Incluye propuestas descartadas o pendientes: un costo menor no las hace elegibles.")
    if len({project.id for project, _ in entries}) > 1:
        notes.append("Son propuestas de proyectos distintos: pueden no cubrir el mismo alcance.")
    rows = []
    for (project, item), (cost, currency) in zip(entries, costs, strict=True):
        difference = cost - cheapest if cost is not None and cheapest is not None else None
        budget = project.presupuesto_referencial
        over = cost - budget if cost is not None and budget is not None and currency == project.moneda.upper() else None
        rows.append(
            ComparedProposal(
                project_id=project.id,
                project_name=project.nombre,
                proposal_id=item.proposal_id,
                filename=item.filename,
                supplier=item.supplier,
                verdict=item.verdict,
                score=item.score,
                cost=cost,
                currency=currency,
                difference_vs_cheapest=difference,
                percent_vs_cheapest=_percent(difference, cheapest) if difference is not None and cheapest else None,
                budget=budget,
                difference_vs_budget=over,
                discard_reasons=tuple(f"{f.code}: {f.reason}" for f in item.findings if f.discards),
            )
        )
    rows.sort(key=lambda r: (r.verdict != VERDICT_VALID, r.cost is None, r.cost or Decimal(0)))
    return Comparison(tuple(rows), shared, tuple(notes))


@dataclass(frozen=True, slots=True)
class Recommendation:
    priority: str  # high | medium | low
    action: str  # shown to people, in Spanish
    basis: str  # the stored fact that supports it


def recommend(
    project: Proyecto,
    proposal_count: int,
    evaluation: ProjectEvaluation | None,
    reviews: Sequence[ReviewDecision] = (),
) -> tuple[Recommendation, ...]:
    """Next steps that follow from what the project already holds. It never awards."""
    if evaluation is None:
        if proposal_count == 0:
            return (Recommendation("high", "Cargue las propuestas recibidas.", "El proyecto no tiene propuestas."),)
        return (
            Recommendation(
                "high",
                "Evalúe las propuestas cargadas antes de compararlas.",
                f"Hay {proposal_count} propuestas cargadas y ninguna evaluación registrada.",
            ),
        )
    out: list[Recommendation] = []
    items = evaluation.items
    if proposal_count > len(items):
        out.append(
            Recommendation(
                "high",
                "Evalúe las propuestas que faltan antes de decidir.",
                f"{len(items)} de {proposal_count} propuestas están evaluadas.",
            )
        )
    decided = {r.proposal_id: r for r in reviews}
    valid = [i for i in items if i.verdict == VERDICT_VALID]
    pending = [i for i in items if i.verdict == VERDICT_PENDING]
    if pending:
        out.append(
            Recommendation(
                "high",
                f"Revise manualmente {len(pending)} propuestas pendientes; podrían cambiar el ranking.",
                "; ".join(
                    f"{i.filename}: {i.findings[0].reason if i.findings else 'lectura incompleta'}" for i in pending[:5]
                ),
            )
        )
    if not valid:
        out.append(
            Recommendation(
                "high",
                "No elija proveedor todavía: confirme los descartes contra los documentos originales.",
                "Ninguna propuesta resultó válida.",
            )
        )
    else:
        best = valid[0]  # items are stored in ranking order
        cost, currency = comparable_cost(best)
        out.append(
            Recommendation(
                "medium",
                f"Presente al comité {best.supplier or best.filename} como la mejor ubicada, para que decida.",
                f"Primera propuesta válida del ranking, puntaje {best.score}, costo {currency or ''} "
                f"{cost if cost is not None else 'no determinado'}.",
            )
        )
        if len(valid) == 1:
            out.append(
                Recommendation(
                    "medium", "Considere pedir más ofertas para tener competencia.", "Solo hay una propuesta válida."
                )
            )
        if best.over_budget:
            out.append(
                Recommendation(
                    "high",
                    "Negocie o revise el presupuesto antes de avanzar.",
                    "La mejor propuesta supera el presupuesto referencial del proyecto.",
                )
            )
    unverified = [i for i in valid + pending if i.unverified]
    if unverified:
        out.append(
            Recommendation(
                "medium",
                "Pida a los proveedores los datos que faltan para completar los controles.",
                "; ".join(f"{i.filename}: sin verificar {', '.join(i.unverified)}" for i in unverified[:5]),
            )
        )
    for item in items:
        if item.supplier_history and item.verdict != VERDICT_DISCARDED:
            out.append(
                Recommendation(
                    "medium",
                    f"Revise los antecedentes de {item.supplier or item.filename}.",
                    " ".join(item.supplier_history),
                )
            )
    unreviewed = [i for i in items if i.proposal_id not in decided]
    if unreviewed:
        out.append(
            Recommendation(
                "low",
                "Verifique en la plataforma cada resultado automático antes de adjudicar.",
                f"{len(unreviewed)} propuestas no tienen verificación humana.",
            )
        )
    out.extend(
        Recommendation("medium", "Atienda el aviso de la evaluación.", warning) for warning in evaluation.warnings
    )
    order = {"high": 0, "medium": 1, "low": 2}
    return tuple(sorted(out, key=lambda r: order[r.priority]))
