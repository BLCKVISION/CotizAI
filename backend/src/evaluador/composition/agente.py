"""Raíz de composición del motor de IA (separada de la HTTP: la usan también el worker y el CLI)."""

from __future__ import annotations

from evaluador.adapters.outbound.agente.motor_langgraph import MotorLangGraph
from evaluador.adapters.outbound.ia.embebedor_fastembed import EmbebedorFastEmbed
from evaluador.adapters.outbound.ia.fabrica import crear_modelo
from evaluador.adapters.outbound.persistence.indice_pgvector import IndicePgVector
from evaluador.application.ports.agente import MotorDeEvaluacion
from evaluador.composition.configuracion import Configuracion


def construir_motor(config: Configuracion | None = None) -> MotorDeEvaluacion:
    c = config or Configuracion()
    return MotorLangGraph(
        modelo=crear_modelo(c),
        embebedor=EmbebedorFastEmbed(c.embeddings_modelo, c.embeddings_cache),
        indice=IndicePgVector(c.base_de_datos_url.get_secret_value()),
    )
