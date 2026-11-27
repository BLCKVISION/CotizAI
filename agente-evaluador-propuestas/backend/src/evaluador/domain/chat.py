"""Chat de evaluación: contrato de la respuesta del modelo y reglas de verificación de citas (puras, sin I/O).

El modelo propone; el código decide: una cita solo vale si su texto aparece literalmente en el documento.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

from pydantic import BaseModel, ConfigDict, Field

NOT_FOUND_ANSWER = "No consta en los documentos de esta evaluación."
MAX_QUESTION_CHARS = 500
MAX_ANSWER_CHARS = 1_500
MAX_CITATIONS = 5
MIN_QUOTE_CHARS = 8  # una cita de pocas letras casi siempre «aparece» por azar: no prueba nada


class ChatCitationDraft(BaseModel):
    """Cita tal como la propone el modelo (aún sin verificar)."""

    model_config = ConfigDict(extra="ignore")

    proposal_id: str = Field(max_length=200)
    quote: str = Field(max_length=1_000)


class ChatAnswer(BaseModel):
    """Salida estructurada del modelo."""

    model_config = ConfigDict(extra="ignore")

    found: bool
    answer: str = Field(default="", max_length=5_000)
    citations: list[ChatCitationDraft] = Field(default_factory=list, max_length=20)


@dataclass(frozen=True, slots=True)
class ChatCitation:
    proposal_id: str
    file: str
    quote: str  # la cita verificada, tal como aparece en el documento


@dataclass(frozen=True, slots=True)
class ChatReply:
    found: bool
    answer: str
    citations: tuple[ChatCitation, ...] = ()


def normalize_text(text: str) -> str:
    """Minúsculas, sin saltos ni espacios repetidos y con unicode compuesto: compara contenido, no formato."""
    composed = unicodedata.normalize("NFC", text).casefold()
    return re.sub(r"\s+", " ", composed).strip()


def quote_in_chunks(quote: str, chunks: list[str]) -> bool:
    """¿La cita (normalizada) está dentro de alguno de los fragmentos? Un fragmento a la vez: no se concatenan."""
    q = normalize_text(quote)
    return len(q) >= MIN_QUOTE_CHARS and any(q in normalize_text(c) for c in chunks)


def not_found() -> ChatReply:
    return ChatReply(found=False, answer=NOT_FOUND_ANSWER)
