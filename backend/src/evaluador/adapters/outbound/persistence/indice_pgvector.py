"""Índice vectorial sobre PostgreSQL + pgvector (similitud coseno, índice HNSW). Todo filtrado por tenant."""

from __future__ import annotations

import numpy as np
import psycopg
from pgvector.psycopg import register_vector

from evaluador.domain.rag import Fragmento, ResultadoBusqueda


class IndicePgVector:
    def __init__(self, dsn: str) -> None:
        self._dsn = dsn

    def _conectar(self) -> psycopg.Connection:
        conn = psycopg.connect(self._dsn)
        register_vector(conn)
        return conn

    def indexar(self, fragmentos: list[Fragmento], vectores: list[list[float]]) -> None:
        filas = [
            (f.id, f.tenant_id, f.propuesta_id, f.orden, f.contenido, np.array(v, dtype=np.float32))
            for f, v in zip(fragmentos, vectores, strict=True)
        ]
        with self._conectar() as conn, conn.cursor() as cur:
            cur.executemany(
                "INSERT INTO fragmentos (id, tenant_id, propuesta_id, orden, contenido, embedding) "
                "VALUES (%s, %s, %s, %s, %s, %s)",
                filas,
            )

    def buscar(
        self, *, tenant_id: str, vector: list[float], k: int, propuesta_id: str | None = None
    ) -> list[ResultadoBusqueda]:
        v = np.array(vector, dtype=np.float32)
        sql = (
            "SELECT id, tenant_id, propuesta_id, orden, contenido, 1 - (embedding <=> %s) AS puntaje "
            "FROM fragmentos WHERE tenant_id = %s"  # el tenant SIEMPRE va en el WHERE
        )
        params: list[object] = [v, tenant_id]
        if propuesta_id is not None:
            sql += " AND propuesta_id = %s"
            params.append(propuesta_id)
        sql += " ORDER BY embedding <=> %s LIMIT %s"
        params += [v, k]
        with self._conectar() as conn, conn.cursor() as cur:
            cur.execute(sql, params)
            return [ResultadoBusqueda(Fragmento(*fila[:5]), float(fila[5])) for fila in cur.fetchall()]

    def eliminar_propuesta(self, *, tenant_id: str, propuesta_id: str) -> None:
        with self._conectar() as conn, conn.cursor() as cur:
            cur.execute("DELETE FROM fragmentos WHERE tenant_id = %s AND propuesta_id = %s", (tenant_id, propuesta_id))
