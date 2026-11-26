"""Índice vectorial en memoria (pruebas). Mismo contrato y mismo aislamiento por tenant que pgvector."""

from __future__ import annotations

import threading

from evaluador.domain.rag import Fragmento, ResultadoBusqueda


class IndiceEnMemoria:
    def __init__(self) -> None:
        self._filas: list[tuple[Fragmento, list[float]]] = []
        self._cerrojo = threading.Lock()  # el modo lote evalúa varios archivos en paralelo sobre el mismo índice

    def indexar(self, fragmentos: list[Fragmento], vectores: list[list[float]]) -> None:
        with self._cerrojo:
            self._filas.extend(zip(fragmentos, vectores, strict=True))

    def buscar(
        self, *, tenant_id: str, vector: list[float], k: int, propuesta_id: str | None = None
    ) -> list[ResultadoBusqueda]:
        with self._cerrojo:
            filas = list(self._filas)
        candidatos = [
            ResultadoBusqueda(f, sum(a * b for a, b in zip(v, vector, strict=True)))
            for f, v in filas
            if f.tenant_id == tenant_id and (propuesta_id is None or f.propuesta_id == propuesta_id)
        ]
        return sorted(candidatos, key=lambda r: r.puntaje, reverse=True)[:k]

    def eliminar_propuesta(self, *, tenant_id: str, propuesta_id: str) -> None:
        with self._cerrojo:
            self._filas = [
                (f, v) for f, v in self._filas if not (f.tenant_id == tenant_id and f.propuesta_id == propuesta_id)
            ]
