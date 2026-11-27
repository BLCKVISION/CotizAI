"""Notas, correcciones y decisión de las personas sobre una evaluación. No tocan el resultado de la IA.

CABLEADO (atributos del Container): add_review, list_reviews.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Request, status
from pydantic import Field

from evaluador.adapters.inbound.http.dtos import ID_PATTERN, InputDto, OutputDto
from evaluador.adapters.inbound.http.guards import require
from evaluador.application.use_cases.authentication import AuthenticatedSession
from evaluador.application.use_cases.reviews import MAX_TEXT
from evaluador.domain.identity import Permission
from evaluador.domain.review import Review, ReviewKind

router = APIRouter(tags=["reviews"])
EvaluationId = Annotated[str, Path(pattern=ID_PATTERN)]


class CreateReviewDto(InputDto):
    kind: ReviewKind
    text: Annotated[str, Field(min_length=1, max_length=MAX_TEXT)]
    proposal_id: Annotated[str | None, Field(default=None, min_length=1, max_length=200)]
    payload: Annotated[dict[str, Annotated[str, Field(max_length=500)]] | None, Field(default=None, max_length=10)]


class ReviewResponse(OutputDto):
    id: str
    evaluation_id: str
    proposal_id: str | None
    author_id: str
    kind: ReviewKind
    text: str
    created: datetime
    payload: dict[str, str] | None

    @classmethod
    def from_domain(cls, r: Review) -> ReviewResponse:
        return cls(
            id=r.id,
            evaluation_id=r.job_id,
            proposal_id=r.proposal_id,
            author_id=r.author_id,
            kind=r.kind,
            text=r.text,
            created=r.created,
            payload=r.payload,
        )


@router.post("/evaluations/{evaluation_id}/reviews", status_code=status.HTTP_201_CREATED)
def add_review(
    evaluation_id: EvaluationId,
    dto: CreateReviewDto,
    request: Request,
    session: Annotated[AuthenticatedSession, Depends(require(Permission.ANNOTATE_REVIEW))],
) -> ReviewResponse:
    """Una decisión exige además poder adjudicar (lo aplica el caso de uso)."""
    review = request.app.state.container.add_review.execute(
        session.user,
        job_id=evaluation_id,
        kind=dto.kind,
        text=dto.text,
        proposal_id=dto.proposal_id,
        payload=dto.payload,
    )
    return ReviewResponse.from_domain(review)


@router.get("/evaluations/{evaluation_id}/reviews")
def list_reviews(
    evaluation_id: EvaluationId,
    request: Request,
    session: Annotated[AuthenticatedSession, Depends(require(Permission.VIEW_RESULTS))],
) -> list[ReviewResponse]:
    return [
        ReviewResponse.from_domain(r)
        for r in request.app.state.container.list_reviews.execute(session.user, evaluation_id)
    ]
