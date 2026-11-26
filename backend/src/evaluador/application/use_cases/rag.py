"""Casos de uso de RAG: indexar documentos y consultarlos, siempre dentro del tenant del actor."""

from __future__ import annotations

from evaluador.application.ports.agente import Embebedor, IndiceVectorial
from evaluador.application.ports.salida import GeneradorDeIds
from evaluador.domain.identidad import Permiso, Usuario
from evaluador.domain.rag import Fragmento, ResultadoBusqueda, fragmentar


class IndexarDocumento:
    def __init__(self, embebedor: Embebedor, indice: IndiceVectorial, ids: GeneradorDeIds) -> None:
        self._embebedor, self._indice, self._ids = embebedor, indice, ids

    def ejecutar(self, actor: Usuario, *, propuesta_id: str, texto: str) -> int:
        actor.exigir(Permiso.CARGAR_DOCUMENTOS)
        piezas = fragmentar(texto)
        if not piezas:
            return 0
        fragmentos = [Fragmento(self._ids.nuevo(), actor.tenant_id, propuesta_id, i, p) for i, p in enumerate(piezas)]
        self._indice.eliminar_propuesta(
            tenant_id=actor.tenant_id, propuesta_id=propuesta_id
        )  # reindexar es idempotente
        self._indice.indexar(fragmentos, self._embebedor.embeber_documentos(piezas))
        return len(fragmentos)


class ConsultarDocumentos:
    def __init__(self, embebedor: Embebedor, indice: IndiceVectorial) -> None:
        self._embebedor, self._indice = embebedor, indice

    def ejecutar(
        self, actor: Usuario, *, consulta: str, propuesta_id: str | None = None, k: int = 5
    ) -> list[ResultadoBusqueda]:
        actor.exigir(Permiso.VER_RESULTADOS)
        return self._indice.buscar(
            tenant_id=actor.tenant_id,
            vector=self._embebedor.embeber_consulta(consulta),
            k=min(k, 20),
            propuesta_id=propuesta_id,
        )
