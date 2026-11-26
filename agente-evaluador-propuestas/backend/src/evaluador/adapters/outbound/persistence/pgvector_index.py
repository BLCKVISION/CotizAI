"""Índice vectorial sobre PostgreSQL + pgvector (similitud coseno, índice HNSW). Todo filtrado por tenant."""

from __future__ import annotations

import numpy as np
import psycopg
from pgvector.psycopg import register_vector

from evaluador.domain.rag import Chunk, SearchResult


class PgvectorIndex:
    def __init__(self, dsn: str) -> None:
        self._dsn = dsn

    def _connect(self) -> psycopg.Connection:
        conn = psycopg.connect(self._dsn)
        register_vector(conn)
        return conn

    def index(self, chunks: list[Chunk], vectors: list[list[float]]) -> None:
        rows = [
            (f.id, f.tenant_id, f.proposal_id, f.order, f.content, np.array(v, dtype=np.float32))
            for f, v in zip(chunks, vectors, strict=True)
        ]
        with self._connect() as conn, conn.cursor() as cur:
            cur.executemany(
                "INSERT INTO fragmentos (id, tenant_id, propuesta_id, orden, contenido, embedding) "
                "VALUES (%s, %s, %s, %s, %s, %s)",
                rows,
            )

    def search(
        self, *, tenant_id: str, vector: list[float], k: int, proposal_id: str | None = None
    ) -> list[SearchResult]:
        v = np.array(vector, dtype=np.float32)
        sql = (
            "SELECT id, tenant_id, propuesta_id, orden, contenido, 1 - (embedding <=> %s) AS puntaje "
            "FROM fragmentos WHERE tenant_id = %s"  # el tenant SIEMPRE va en el WHERE
        )
        params: list = [v, tenant_id]
        if proposal_id is not None:
            sql += " AND propuesta_id = %s"
            params.append(proposal_id)
        sql += " ORDER BY embedding <=> %s LIMIT %s"
        params += [v, k]
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(sql, params)
            return [SearchResult(Chunk(*row[:5]), float(row[5])) for row in cur.fetchall()]

    def delete_proposal(self, *, tenant_id: str, proposal_id: str) -> None:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute("DELETE FROM fragmentos WHERE tenant_id = %s AND propuesta_id = %s", (tenant_id, proposal_id))
