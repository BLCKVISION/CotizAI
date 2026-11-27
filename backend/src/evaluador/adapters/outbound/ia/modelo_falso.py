"""Modelo determinista para pruebas y demos sin red."""

from __future__ import annotations

from collections.abc import Callable
from typing import cast

from pydantic import BaseModel


class ModeloFalso:
    def __init__(self, respuestas: dict[type[BaseModel], Callable[[str], BaseModel] | BaseModel]) -> None:
        self._respuestas = respuestas
        self.llamadas: list[tuple[str, str]] = []
        self.llamadas_imagen: list[tuple[str, str]] = []  # (instrucciones, mime)

    def estructurar[M: BaseModel](
        self, *, instrucciones: str, contenido_no_confiable: str, esquema: type[M], temperature: float = 0
    ) -> M:
        self.llamadas.append((instrucciones, contenido_no_confiable))
        r = self._respuestas[esquema]
        return cast(M, r(contenido_no_confiable) if callable(r) else r)

    def estructurar_imagen(
        self, *, instrucciones: str, imagen: bytes, mime: str, esquema: type[BaseModel]
    ) -> BaseModel:
        self.llamadas_imagen.append((instrucciones, mime))
        r = self._respuestas[esquema]
        return r(imagen.decode("latin-1")) if callable(r) else r
