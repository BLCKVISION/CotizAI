"""Modelo determinista para pruebas y demos sin red."""

from __future__ import annotations

from collections.abc import Callable

from pydantic import BaseModel


class ModeloFalso:
    def __init__(self, respuestas: dict[type[BaseModel], Callable[[str], BaseModel] | BaseModel]) -> None:
        self._respuestas = respuestas
        self.llamadas: list[tuple[str, str]] = []

    def estructurar(self, *, instrucciones: str, contenido_no_confiable: str, esquema: type[BaseModel]):
        self.llamadas.append((instrucciones, contenido_no_confiable))
        r = self._respuestas[esquema]
        return r(contenido_no_confiable) if callable(r) else r
