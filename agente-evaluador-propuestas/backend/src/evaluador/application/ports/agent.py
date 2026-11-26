"""Puertos del motor de IA. El dominio y los casos de uso no saben qué modelo ni qué base vectorial hay detrás."""

from __future__ import annotations

from typing import Protocol, TypeVar

from pydantic import BaseModel

from evaluador.domain.evaluation import EvaluationResult
from evaluador.domain.rag import Chunk, SearchResult

T = TypeVar("T", bound=BaseModel)


class LanguageModel(Protocol):
    """Sin herramientas: el modelo solo lee y devuelve datos validados contra un esquema."""

    def structure(self, *, instructions: str, untrusted_content: str, schema: type[T]) -> T: ...


class VisionModel(Protocol):
    """Lee una imagen y devuelve datos validados contra un esquema. Sin herramientas; la imagen es un dato."""

    def structure_image(self, *, instructions: str, image: bytes, mime: str, schema: type[T]) -> T: ...


class Embedder(Protocol):
    @property
    def dimension(self) -> int: ...
    def embed_documents(self, texts: list[str]) -> list[list[float]]: ...
    def embed_query(self, text: str) -> list[float]: ...


class VectorIndex(Protocol):
    """Toda operación va acotada por tenant: el adaptador DEBE filtrar por tenant_id."""

    def index(self, chunks: list[Chunk], vectors: list[list[float]]) -> None: ...
    def search(
        self, *, tenant_id: str, vector: list[float], k: int, proposal_id: str | None = None
    ) -> list[SearchResult]: ...
    def delete_proposal(self, *, tenant_id: str, proposal_id: str) -> None: ...


class EvaluationEngine(Protocol):
    def evaluate(self, *, tenant_id: str, proposal_id: str, requirement: str, text: str) -> EvaluationResult: ...
