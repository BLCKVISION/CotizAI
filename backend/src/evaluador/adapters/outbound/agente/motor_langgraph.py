"""Adaptador del puerto MotorDeEvaluacion sobre LangGraph."""

from __future__ import annotations

from evaluador.application.ports.agente import Embebedor, IndiceVectorial, ModeloDeLenguaje
from evaluador.domain.evaluacion import ResultadoEvaluacion

from .grafo import construir_grafo
from .nodos import NodosEvaluacion


class MotorLangGraph:
    def __init__(self, modelo: ModeloDeLenguaje, embebedor: Embebedor, indice: IndiceVectorial) -> None:
        self._grafo = construir_grafo(NodosEvaluacion(modelo, embebedor, indice))

    def evaluar(self, *, tenant_id: str, propuesta_id: str, requerimiento: str, texto: str) -> ResultadoEvaluacion:
        final = self._grafo.invoke(
            {
                "tenant_id": tenant_id,
                "propuesta_id": propuesta_id,
                "requerimiento": requerimiento,
                "texto": texto,
                "hallazgos": [],
            }  # fmt: skip
        )
        return final["resultado"]
