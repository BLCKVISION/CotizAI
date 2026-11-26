"""Fábrica de modelos: el proveedor y el modelo se eligen por configuración, no por código (Strategy + Factory)."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from evaluador.application.ports.agente import ModeloDeLenguaje


def _openai(c: Any) -> ModeloDeLenguaje:
    from .modelo_openai_compatible import ModeloOpenAICompatible

    return ModeloOpenAICompatible(base_url=c.ia_base_url, modelo=c.ia_modelo, api_key=c.ia_api_key.get_secret_value())


def _anthropic(c: Any) -> ModeloDeLenguaje:
    from .modelo_anthropic import ModeloAnthropic

    return ModeloAnthropic(modelo=c.ia_modelo, api_key=c.ia_api_key.get_secret_value())


_REGISTRO: dict[str, Callable[[Any], ModeloDeLenguaje]] = {"openai_compatible": _openai, "anthropic": _anthropic}


def registrar_proveedor(nombre: str, constructor: Callable[[Any], ModeloDeLenguaje]) -> None:
    """Punto de extensión (abierto/cerrado): añadir un proveedor no modifica código existente."""
    _REGISTRO[nombre] = constructor


def crear_modelo(config: Any) -> ModeloDeLenguaje:
    try:
        return _REGISTRO[config.ia_proveedor](config)
    except KeyError:
        raise ValueError(
            f"Proveedor de IA desconocido: {config.ia_proveedor!r}. Opciones: {sorted(_REGISTRO)}"
        ) from None
