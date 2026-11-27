"""Composición del worker: toma los trabajos que encola la API y los evalúa con el mismo pipeline del lote.

`python -m evaluador.worker` carga `build_worker()` desde aquí. API y worker son procesos distintos, así que solo se
entienden a través de la base de datos: por eso exige `EVALUADOR_PERSISTENCIA=sql`.
"""

from __future__ import annotations

import time
import uuid
from collections.abc import Callable

from evaluador.adapters.outbound.agent.langgraph_engine import LanggraphEngine
from evaluador.adapters.outbound.ai.factory import create_model
from evaluador.adapters.outbound.ai.fastembed_embedder import FastEmbedEmbedder
from evaluador.adapters.outbound.extraction.reader import read_document
from evaluador.adapters.outbound.memory.audit_trail import ChainedAudit
from evaluador.adapters.outbound.memory.vector_index import InMemoryIndex
from evaluador.adapters.outbound.security.tokens import SystemClock
from evaluador.application.ports.agent import Embedder, LanguageModel
from evaluador.application.use_cases.evaluate_file import EvaluateFile
from evaluador.application.use_cases.evaluation_flow import RunNextJob
from evaluador.composition.settings import Settings
from evaluador.composition.wiring import build_repositories


def build_worker(
    config: Settings | None = None,
    *,
    model: LanguageModel | None = None,
    embedder: Embedder | None = None,
    wait: Callable[[float], None] = time.sleep,
) -> RunNextJob:
    """`model`, `embedder` y `wait` se inyectan en las pruebas; en producción salen de la configuración."""
    config = config or Settings()
    if config.persistence.strip().lower() != "sql":
        raise RuntimeError(
            "El worker necesita EVALUADOR_PERSISTENCIA=sql: comparte la cola con la API a través de la base de datos."
        )
    repos = build_repositories(config)
    model = model or create_model(config)
    embedder = embedder or FastEmbedEmbedder(config.embeddings_model, config.embeddings_cache)
    index = InMemoryIndex()
    vision = model if hasattr(model, "structure_image") else None
    clock = SystemClock()
    evaluator = EvaluateFile(
        read=lambda name, data: read_document(name, data, vision),  # type: ignore[arg-type]
        embedder=embedder,
        index=index,
        engine=LanggraphEngine(model, embedder, index),
        model=model,
        requirement=config.batch_requirement,
        chunk_id=lambda: str(uuid.uuid4()),
    )
    return RunNextJob(
        jobs=repos.jobs,
        events=repos.job_events,
        results=repos.results,
        proposals=repos.proposals,
        files=repos.files,
        projects=repos.projects,
        evaluator=evaluator,
        clock=clock,
        audit=ChainedAudit(repos.audit_trail, clock),
        parallel=config.batch_parallel,
        retries=config.batch_retries,
        wait=wait,
    )
