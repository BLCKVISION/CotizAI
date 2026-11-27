"""Hallazgos y veredicto. La IA propone; el código decide a partir de hallazgos con evidencia."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum

from .extraccion import ExtraccionPropuesta


class CodigoHallazgo(StrEnum):
    ALCANCE = "ALCANCE"
    COMPAT = "COMPAT"
    CAPACIDAD = "CAPACIDAD"
    CALIDAD = "CALIDAD"
    ABUSIVO = "ABUSIVO"
    ARITMETICA = "ARITMETICA"
    MANIPULACION = "MANIPULACION"
    LECTURA = "LECTURA"  # error de lectura: no descarta, pide revisión


class Origen(StrEnum):
    REGLA = "regla"
    IA = "ia"
    PERSONA = "persona"


class Severidad(StrEnum):
    INFO = "info"
    ADVERTENCIA = "advertencia"
    CRITICA = "critica"


class Veredicto(StrEnum):
    VALIDA = "valida"
    DESCARTADA = "descartada"
    PENDIENTE_DE_REVISION = "pendiente_de_revision"


@dataclass(frozen=True, slots=True)
class Hallazgo:
    codigo: CodigoHallazgo
    severidad: Severidad
    descarta: bool
    motivo: str
    evidencia: str
    origen: Origen


@dataclass(frozen=True, slots=True)
class ResultadoEvaluacion:
    propuesta_id: str
    veredicto: Veredicto
    hallazgos: tuple[Hallazgo, ...] = field(default_factory=tuple)
    extraccion: ExtraccionPropuesta | None = None
    trace: tuple = ()  # TraceStep items; the module that defines them imports this one
