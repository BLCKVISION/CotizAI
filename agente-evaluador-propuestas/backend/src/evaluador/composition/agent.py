"""Raíz de composición del motor de IA (separada de la HTTP: la usan también el worker y el CLI)."""

from __future__ import annotations

from evaluador.adapters.outbound.agent.langgraph_engine import LanggraphEngine
from evaluador.adapters.outbound.ai.factory import create_model
from evaluador.adapters.outbound.ai.fastembed_embedder import FastEmbedEmbedder
from evaluador.adapters.outbound.persistence.pgvector_index import PgvectorIndex
from evaluador.application.ports.agent import EvaluationEngine
from evaluador.composition.settings import Settings


def build_engine(config: Settings | None = None) -> EvaluationEngine:
    c = config or Settings()
    return LanggraphEngine(
        model=create_model(c),
        embedder=FastEmbedEmbedder(c.embeddings_model, c.embeddings_cache),
        index=PgvectorIndex(c.database_url.get_secret_value()),
    )
