"""Revisión humana: notas, correcciones y decisión. Se guardan aparte: el resultado de la IA no se sobrescribe."""

from __future__ import annotations

import re

from evaluador.application.ports.output import Audit, Clock, IdGenerator
from evaluador.application.ports.workflow import ReviewRepository
from evaluador.application.use_cases.evaluation_lookup import EvaluationLookup
from evaluador.domain.errors import InvalidData, NotFound
from evaluador.domain.evaluation import Verdict
from evaluador.domain.identity import Permission, User
from evaluador.domain.review import Review, ReviewKind

MAX_TEXT = 2000
_MAX_PAYLOAD_ENTRIES = 10
_MAX_PAYLOAD_VALUE = 500
_KEY = re.compile(r"^[a-z][a-z0-9_]{0,49}$")
_DECISIONS = frozenset({"award", "discard"})


def _validate_payload(payload: dict[str, str] | None) -> dict[str, str]:
    if not payload:
        raise InvalidData("Esta revisión exige indicar qué se corrige o decide.")
    if len(payload) > _MAX_PAYLOAD_ENTRIES:
        raise InvalidData("Demasiados campos en la corrección.")
    for key, value in payload.items():
        if not _KEY.match(key):
            raise InvalidData("Nombre de campo inválido en la corrección.")
        if len(value) > _MAX_PAYLOAD_VALUE:
            raise InvalidData("Un valor de la corrección es demasiado largo.")
    return dict(payload)


class AddReview:
    def __init__(
        self, reviews: ReviewRepository, evaluations: EvaluationLookup, ids: IdGenerator, clock: Clock, audit: Audit
    ) -> None:
        self._reviews, self._evaluations, self._ids, self._clock, self._audit = reviews, evaluations, ids, clock, audit

    def execute(
        self,
        actor: User,
        *,
        job_id: str,
        kind: ReviewKind,
        text: str,
        proposal_id: str | None,
        payload: dict[str, str] | None,
    ) -> Review:
        actor.require(Permission.ANNOTATE_REVIEW)
        if kind is ReviewKind.DECISION:
            actor.require(Permission.AWARD_OR_CLOSE)  # solo quien puede adjudicar recomienda adjudicar o descartar
        known = self._evaluations.proposal_ids(actor.tenant_id, job_id)
        if known is None:  # también cubre «existe pero es de otro tenant»
            raise NotFound("Evaluación no encontrada.")
        text = text.strip()
        if not 1 <= len(text) <= MAX_TEXT:
            raise InvalidData(f"El texto debe tener entre 1 y {MAX_TEXT} caracteres.")
        if proposal_id is not None and proposal_id not in known:
            raise InvalidData("La propuesta no pertenece a esta evaluación.")
        clean = self._validate_by_kind(kind, proposal_id, payload)
        review = Review(
            id=self._ids.new(),
            tenant_id=actor.tenant_id,  # siempre el del actor, nunca el del cliente
            job_id=job_id,
            proposal_id=proposal_id,
            author_id=actor.id,
            kind=kind,
            text=text,
            created=self._clock.now(),
            payload=clean,
        )
        self._reviews.add(review)
        # Solo id y tipo: el texto de una persona puede citar contenido de las propuestas.
        self._audit.register(
            tenant_id=actor.tenant_id, actor=actor.id, action="review_added", detail=f"{review.id}:{kind.value}"
        )
        return review

    @staticmethod
    def _validate_by_kind(
        kind: ReviewKind, proposal_id: str | None, payload: dict[str, str] | None
    ) -> dict[str, str] | None:
        if kind is ReviewKind.NOTE:
            return _validate_payload(payload) if payload else None
        if proposal_id is None:
            raise InvalidData("Esta revisión debe indicar la propuesta a la que se refiere.")
        clean = _validate_payload(payload)
        if kind is ReviewKind.CORRECTION:
            if "verdict" in clean and clean["verdict"] not in {v.value for v in Verdict}:
                raise InvalidData("Veredicto inválido en la corrección.")
        elif clean.get("decision") not in _DECISIONS:
            raise InvalidData("La decisión debe ser «award» (adjudicar) o «discard» (descartar).")
        return clean


class ListReviews:
    def __init__(self, reviews: ReviewRepository, evaluations: EvaluationLookup) -> None:
        self._reviews, self._evaluations = reviews, evaluations

    def execute(self, actor: User, job_id: str) -> list[Review]:
        actor.require(Permission.VIEW_RESULTS)
        if not self._evaluations.exists(actor.tenant_id, job_id):
            raise NotFound("Evaluación no encontrada.")
        return self._reviews.list_for_job(actor.tenant_id, job_id)
