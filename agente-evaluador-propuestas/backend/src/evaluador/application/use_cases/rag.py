"""Casos de uso de RAG: indexar documentos y consultarlos, siempre dentro del tenant del actor."""

from __future__ import annotations

from evaluador.application.ports.agent import Embedder, VectorIndex
from evaluador.application.ports.output import IdGenerator
from evaluador.domain.identity import Permission, User
from evaluador.domain.rag import Chunk, SearchResult, chunk


class IndexDocument:
    def __init__(self, embedder: Embedder, index: VectorIndex, ids: IdGenerator) -> None:
        self._embedder, self._index, self._ids = embedder, index, ids

    def execute(self, actor: User, *, proposal_id: str, text: str) -> int:
        actor.require(Permission.LOAD_DOCUMENTS)
        parts = chunk(text)
        # Primero se calculan los vectores: si el modelo falla, no se pierde lo indexado antes.
        vectors = self._embedder.embed_documents(parts) if parts else []
        chunks = [Chunk(self._ids.new(), actor.tenant_id, proposal_id, i, p) for i, p in enumerate(parts)]
        self._index.delete_proposal(tenant_id=actor.tenant_id, proposal_id=proposal_id)  # idempotente
        if chunks:
            self._index.index(chunks, vectors)
        return len(chunks)


class QueryDocuments:
    def __init__(self, embedder: Embedder, index: VectorIndex) -> None:
        self._embedder, self._index = embedder, index

    def execute(self, actor: User, *, query: str, proposal_id: str | None = None, k: int = 5) -> list[SearchResult]:
        actor.require(Permission.VIEW_RESULTS)
        return self._index.search(
            tenant_id=actor.tenant_id,
            vector=self._embedder.embed_query(query),
            k=max(1, min(k, 20)),
            proposal_id=proposal_id,
        )
