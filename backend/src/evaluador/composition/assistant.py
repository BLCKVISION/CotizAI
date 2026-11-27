"""Composition of the assistant."""

from __future__ import annotations

import threading
from collections.abc import Callable

from evaluador.adapters.outbound.agente.assistant_graph import LangGraphAssistantEngine
from evaluador.adapters.outbound.busqueda.openrouter_sonar import OpenRouterMarketSearch
from evaluador.adapters.outbound.ia.chat_openai_compatible import OpenAICompatibleChat
from evaluador.application.ports.assistant import MarketPriceLookup
from evaluador.application.use_cases.assistant.chat import AssistantServices
from evaluador.composition.configuracion import Configuracion
from evaluador.domain.errores import ServicioNoDisponible

__all__ = ["LangGraphAssistantEngine", "assistant_market_for", "lazy_assistant_services"]


def assistant_market_for(config: Configuracion | None) -> MarketPriceLookup | None:
    if config is None or not config.assistant_market_search_enabled or not config.ia_api_key.get_secret_value():
        return None
    return OpenRouterMarketSearch(
        api_key=config.ia_api_key.get_secret_value(), base_url=config.ia_base_url, model=config.market_search_model
    )


def lazy_assistant_services(config: Configuracion | None) -> Callable[[], AssistantServices]:
    lock = threading.Lock()
    built: list[AssistantServices] = []

    def provide() -> AssistantServices:
        with lock:
            if not built:
                if config is None or config.ia_proveedor != "openai_compatible":
                    raise ServicioNoDisponible(
                        "El asistente necesita un modelo compatible con OpenAI. Revise la configuración."
                    )
                chat = OpenAICompatibleChat(
                    base_url=config.ia_base_url,
                    model=config.assistant_model or config.ia_modelo,
                    api_key=config.ia_api_key.get_secret_value(),
                )
                built.append(AssistantServices(chat=chat))
            return built[0]

    return provide
