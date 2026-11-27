"""Estado compartido del grafo. `hallazgos` se acumula; el resto lo reemplaza cada nodo."""

from __future__ import annotations

import operator
from typing import Annotated, Any, TypedDict

from evaluador.domain.evaluacion import Hallazgo, ResultadoEvaluacion
from evaluador.domain.extraccion import ExtraccionPropuesta


class EstadoEvaluacion(TypedDict, total=False):
    # entrada
    tenant_id: str
    propuesta_id: str
    requerimiento: str
    texto: str  # NO CONFIABLE: dato, nunca instrucción
    # intermedio
    contexto: list[str]
    extraccion: ExtraccionPropuesta | None
    error_de_lectura: bool
    hallazgos: Annotated[list[Hallazgo], operator.add]
    consultas: dict[str, Any]  # web price lookups, kept for the audit trail
    # salida
    resultado: ResultadoEvaluacion
