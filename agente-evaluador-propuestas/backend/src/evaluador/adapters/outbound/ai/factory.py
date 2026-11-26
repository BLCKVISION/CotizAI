"""Fábrica de modelos: el proveedor y el modelo se eligen por configuración, no por código (Strategy + Factory)."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from evaluador.application.ports.agent import LanguageModel


def _openai(c: Any) -> LanguageModel:
    from .openai_compatible_model import OpenAiCompatibleModel

    return OpenAiCompatibleModel(base_url=c.ai_base_url, model=c.ai_model, api_key=c.ai_api_key.get_secret_value())


def _anthropic(c: Any) -> LanguageModel:
    from .anthropic_model import AnthropicModel

    return AnthropicModel(model=c.ai_model, api_key=c.ai_api_key.get_secret_value())


_LOG: dict[str, Callable[[Any], LanguageModel]] = {"openai_compatible": _openai, "anthropic": _anthropic}


def register_provider(name: str, constructor: Callable[[Any], LanguageModel]) -> None:
    """Punto de extensión (abierto/cerrado): añadir un proveedor no modifica código existente."""
    _LOG[name] = constructor


def create_model(config: Any) -> LanguageModel:
    try:
        return _LOG[config.ai_provider](config)
    except KeyError:
        raise ValueError(f"Proveedor de IA desconocido: {config.ai_provider!r}. Opciones: {sorted(_LOG)}") from None
