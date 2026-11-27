"""Composition of the AI services used by the platform. Built on first use: the embedding model is large."""

from __future__ import annotations

import logging
import threading
import uuid
from collections.abc import Callable

from evaluador.adapters.outbound.agente.motor_langgraph import MotorLangGraph
from evaluador.adapters.outbound.busqueda.openrouter_sonar import OpenRouterMarketSearch
from evaluador.adapters.outbound.extraccion.lector import leer_documento
from evaluador.adapters.outbound.ia.fabrica import crear_modelo
from evaluador.adapters.outbound.memory.indice_vectorial import IndiceEnMemoria
from evaluador.application.ports.agente import Embebedor, ModeloDeLenguaje
from evaluador.application.use_cases.evaluar_archivo import EvaluarArchivo
from evaluador.application.use_cases.evaluate_project import EvaluationServices
from evaluador.composition.configuracion import Configuracion
from evaluador.domain.errores import ServicioNoDisponible

_log = logging.getLogger("evaluador.composition")


def market_search_for(config: Configuracion) -> OpenRouterMarketSearch | None:
    if not config.market_search_enabled:
        return None
    return OpenRouterMarketSearch(
        api_key=config.ia_api_key.get_secret_value(), base_url=config.ia_base_url, model=config.market_search_model
    )


def build_services(config: Configuracion, model: ModeloDeLenguaje, embedder: Embebedor) -> EvaluationServices:
    index = IndiceEnMemoria()  # transient: holds a proposal only while it is being judged
    vision = model if hasattr(model, "estructurar_imagen") else None
    new_id = lambda: str(uuid.uuid4())  # noqa: E731
    evaluator = EvaluarArchivo(
        leer=lambda name, data: leer_documento(name, data, vision),  # type: ignore[arg-type]
        embebedor=embedder,
        indice=index,
        motor=MotorLangGraph(model, embedder, index, market_search_for(config)),
        modelo=model,
        requerimiento=config.lote_requerimiento,
        id_fragmento=new_id,
    )
    return EvaluationServices(evaluator, model, embedder, IndiceEnMemoria(), new_id)


def lazy_services(config: Configuracion | None) -> Callable[[], EvaluationServices]:
    lock = threading.Lock()
    built: list[EvaluationServices] = []

    def provide() -> EvaluationServices:
        with lock:
            if not built:
                if config is None:
                    raise ServicioNoDisponible("El motor de IA no está configurado.")
                try:
                    from evaluador.adapters.outbound.ia.embebedor_fastembed import EmbebedorFastEmbed

                    embedder = EmbebedorFastEmbed(config.embeddings_modelo, config.embeddings_cache)
                    built.append(build_services(config, crear_modelo(config), embedder))
                except Exception as exc:  # noqa: BLE001 - e.g. the embedding model cannot be downloaded
                    _log.error("ai_startup_failed", extra={"tipo": type(exc).__name__})
                    raise ServicioNoDisponible("No se pudo iniciar el motor de IA. Revise su configuración.") from exc
            return built[0]

    return provide
