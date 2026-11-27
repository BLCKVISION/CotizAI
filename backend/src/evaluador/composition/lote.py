"""Composición del modo lote: sin base de datos (índice en memoria) y sin pasos manuales."""

from __future__ import annotations

import uuid
from pathlib import Path

from evaluador.adapters.outbound.agente.motor_langgraph import MotorLangGraph
from evaluador.adapters.outbound.extraccion.lector import leer_documento
from evaluador.adapters.outbound.ia.embebedor_fastembed import EmbebedorFastEmbed
from evaluador.adapters.outbound.ia.fabrica import crear_modelo
from evaluador.adapters.outbound.memory.indice_vectorial import IndiceEnMemoria
from evaluador.application.use_cases.evaluar_archivo import EvaluarArchivo
from evaluador.application.use_cases.lote import ProcesarLote
from evaluador.composition.ai import market_search_for
from evaluador.composition.configuracion import Configuracion


def construir_lote(config: Configuracion, carpeta: Path) -> ProcesarLote:
    modelo = crear_modelo(config)
    embebedor = EmbebedorFastEmbed(config.embeddings_modelo, config.embeddings_cache)
    indice = IndiceEnMemoria()
    vision = modelo if hasattr(modelo, "estructurar_imagen") else None
    evaluador = EvaluarArchivo(
        leer=lambda nombre, datos: leer_documento(nombre, datos, vision),  # type: ignore[arg-type]
        embebedor=embebedor,
        indice=indice,
        motor=MotorLangGraph(modelo, embebedor, indice, market_search_for(config)),
        modelo=modelo,
        requerimiento=config.lote_requerimiento,
        id_fragmento=lambda: str(uuid.uuid4()),
    )
    return ProcesarLote(
        evaluador=evaluador,
        cargar=lambda nombre: (carpeta / nombre).read_bytes(),
        paralelo=config.lote_paralelo,
        reintentos=config.lote_reintentos,
    )
