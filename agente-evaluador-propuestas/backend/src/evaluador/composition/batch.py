"""Composición del modo lote: sin base de datos (índice en memoria) y sin pasos manuales."""

from __future__ import annotations

import uuid
from pathlib import Path

from evaluador.adapters.outbound.agent.langgraph_engine import LanggraphEngine
from evaluador.adapters.outbound.ai.factory import create_model
from evaluador.adapters.outbound.ai.fastembed_embedder import FastEmbedEmbedder
from evaluador.adapters.outbound.extraction.reader import read_document
from evaluador.adapters.outbound.memory.vector_index import InMemoryIndex
from evaluador.application.use_cases.batch import ProcessBatch
from evaluador.application.use_cases.evaluate_file import EvaluateFile
from evaluador.composition.settings import Settings


def build_batch(config: Settings, folder: Path) -> ProcessBatch:
    model = create_model(config)
    embedder = FastEmbedEmbedder(config.embeddings_model, config.embeddings_cache)
    index = InMemoryIndex()
    vision = model if hasattr(model, "structure_image") else None
    evaluador = EvaluateFile(
        read=lambda name, data: read_document(name, data, vision),  # type: ignore[arg-type]
        embedder=embedder,
        index=index,
        engine=LanggraphEngine(model, embedder, index),
        model=model,
        requirement=config.batch_requirement,
        chunk_id=lambda: str(uuid.uuid4()),
    )
    return ProcessBatch(
        evaluador=evaluador,
        load=lambda name: (folder / name).read_bytes(),
        parallel=config.batch_parallel,
        retries=config.batch_retries,
    )
