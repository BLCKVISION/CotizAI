"""Puertos del motor de IA. El dominio y los casos de uso no saben qué modelo ni qué base vectorial hay detrás."""

from __future__ import annotations

from typing import Protocol, TypeVar

from pydantic import BaseModel

from evaluador.domain.evaluacion import ResultadoEvaluacion
from evaluador.domain.rag import Fragmento, ResultadoBusqueda

T = TypeVar("T", bound=BaseModel)


class ModeloDeLenguaje(Protocol):
    """Sin herramientas: el modelo solo lee y devuelve datos validados contra un esquema."""

    def estructurar(self, *, instrucciones: str, contenido_no_confiable: str, esquema: type[T]) -> T: ...


class Embebedor(Protocol):
    @property
    def dimension(self) -> int: ...
    def embeber_documentos(self, textos: list[str]) -> list[list[float]]: ...
    def embeber_consulta(self, texto: str) -> list[float]: ...


class IndiceVectorial(Protocol):
    """Toda operación va acotada por tenant: el adaptador DEBE filtrar por tenant_id."""

    def indexar(self, fragmentos: list[Fragmento], vectores: list[list[float]]) -> None: ...
    def buscar(
        self, *, tenant_id: str, vector: list[float], k: int, propuesta_id: str | None = None
    ) -> list[ResultadoBusqueda]: ...
    def eliminar_propuesta(self, *, tenant_id: str, propuesta_id: str) -> None: ...


class MotorDeEvaluacion(Protocol):
    def evaluar(self, *, tenant_id: str, propuesta_id: str, requerimiento: str, texto: str) -> ResultadoEvaluacion: ...
