"""Chat de una evaluación: POST /evaluations/{evaluation_id}/chat.

CABLEADO: `app.state.container.ask_chat` debe ser un `AskEvaluationChat` y el router se incluye en `/api/v1`.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Request
from pydantic import Field

from evaluador.adapters.inbound.http.dtos import ID_PATTERN, InputDto, OutputDto
from evaluador.adapters.inbound.http.guards import require
from evaluador.application.use_cases.authentication import AuthenticatedSession
from evaluador.domain.chat import MAX_QUESTION_CHARS, ChatReply
from evaluador.domain.identity import Permission

router = APIRouter(prefix="/evaluations", tags=["chat"])
EvaluationId = Annotated[str, Path(pattern=ID_PATTERN)]


class ChatQuestionDto(InputDto):
    question: Annotated[str, Field(min_length=1, max_length=MAX_QUESTION_CHARS)]


class ChatCitationResponse(OutputDto):
    proposal_id: str
    file: str
    quote: str


class ChatResponse(OutputDto):
    found: bool
    answer: str
    citations: list[ChatCitationResponse]

    @classmethod
    def from_domain(cls, r: ChatReply) -> ChatResponse:
        return cls(
            found=r.found,
            answer=r.answer,
            citations=[
                ChatCitationResponse(proposal_id=c.proposal_id, file=c.file, quote=c.quote) for c in r.citations
            ],
        )


@router.post("/{evaluation_id}/chat")
def ask_chat(
    evaluation_id: EvaluationId,
    dto: ChatQuestionDto,
    request: Request,
    session: Annotated[AuthenticatedSession, Depends(require(Permission.VIEW_RESULTS))],
) -> ChatResponse:
    """Responde con citas verificadas en los documentos; si no hay evidencia, «no consta»."""
    reply = request.app.state.container.ask_chat.execute(session.user, evaluation_id, dto.question)
    return ChatResponse.from_domain(reply)
