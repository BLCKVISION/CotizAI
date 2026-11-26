"""Proyecto y su máquina de estados (patrón State como tabla de transiciones)."""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import datetime
from decimal import Decimal
from enum import StrEnum

from .errors import InvalidData, InvalidTransition
from .identity import Permission


class ProjectState(StrEnum):
    RECEIVING = "receiving"
    EVALUATING = "evaluating"
    COMMITTEE_REVIEW = "committee_review"
    AWARDED = "awarded"
    CLOSED = "closed"


E = ProjectState

# destino permitido -> origenes válidos
_TRANSITIONS: dict[ProjectState, frozenset[ProjectState]] = {
    E.EVALUATING: frozenset({E.RECEIVING}),
    E.RECEIVING: frozenset({E.EVALUATING}),  # la evaluación falló
    E.COMMITTEE_REVIEW: frozenset({E.EVALUATING}),
    E.AWARDED: frozenset({E.COMMITTEE_REVIEW}),
    E.CLOSED: frozenset({E.RECEIVING, E.COMMITTEE_REVIEW, E.AWARDED}),
}

PERMISSION_BY_TARGET: dict[ProjectState, Permission] = {
    E.EVALUATING: Permission.START_EVALUATION,
    E.RECEIVING: Permission.START_EVALUATION,
    E.COMMITTEE_REVIEW: Permission.START_EVALUATION,
    E.AWARDED: Permission.AWARD_OR_CLOSE,
    E.CLOSED: Permission.AWARD_OR_CLOSE,
}


@dataclass(frozen=True, slots=True)
class Project:
    id: str
    tenant_id: str
    name: str
    requirement: str
    location: str
    reference_budget: Decimal | None
    state: ProjectState
    created_by: str
    created: datetime
    closing_reason: str | None = None

    @staticmethod
    def create(
        *,
        id: str,
        tenant_id: str,
        name: str,
        requirement: str,
        location: str,
        reference_budget: Decimal | None,
        created_by: str,
        now: datetime,
    ) -> Project:
        if not name.strip():
            raise InvalidData("El nombre del proyecto es obligatorio.")
        if reference_budget is not None and reference_budget <= 0:
            raise InvalidData("El presupuesto referencial debe ser positivo.")
        return Project(
            id=id,
            tenant_id=tenant_id,
            name=name.strip(),
            requirement=requirement.strip(),
            location=location.strip(),
            reference_budget=reference_budget,
            state=E.RECEIVING,
            created_by=created_by,
            created=now,
        )

    def transition(self, target: ProjectState, reason: str | None = None) -> Project:
        if self.state not in _TRANSITIONS.get(target, frozenset()):
            raise InvalidTransition(f"No se puede pasar de '{self.state}' a '{target}'.")
        if target is E.CLOSED and self.state is not E.AWARDED and not (reason or "").strip():
            raise InvalidData("Cerrar sin adjudicar exige un motivo.")
        return replace(
            self,
            state=target,
            closing_reason=(reason or "").strip() or None if target is E.CLOSED else self.closing_reason,
        )
