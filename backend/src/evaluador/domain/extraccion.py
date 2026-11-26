"""Contrato central de extracción (sección 3.1 del diseño). Los montos viajan como texto: literal + normalizado.

El modelo solo transcribe; nunca recalcula. `null` (None) significa «no consta».
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class _Base(BaseModel):
    model_config = ConfigDict(extra="ignore")


class Monto(_Base):
    literal: str  # tal como aparece en el documento, p. ej. "1.100,00"
    valor: str  # normalizado con punto decimal, p. ej. "1100.00"


class Evidencia(_Base):
    pagina_o_celda: str = ""
    texto: str = ""


class Linea(_Base):
    descripcion: str
    categoria: str  # gabinete | monitor | teclado | raton | protector | otro ...
    marca: str | None = None
    modelo: str | None = None
    especificaciones: dict[str, str] = Field(default_factory=dict)
    cantidad: Monto
    precio_unitario: Monto
    total_linea: Monto
    evidencia: Evidencia = Field(default_factory=Evidencia)
    legibilidad: Literal["alta", "media", "baja"] = "alta"


class Totales(_Base):
    subtotal: Monto | None = None
    impuestos: list[Monto] = Field(default_factory=list)
    total: Monto | None = None


class ExtraccionPropuesta(_Base):
    proveedor: str | None = None
    moneda: str | None = None
    lineas: list[Linea] = Field(default_factory=list)
    totales: Totales = Field(default_factory=Totales)
    sospechas_de_manipulacion: list[str] = Field(default_factory=list)


class JuicioDeAlcance(_Base):
    """Salida del modelo para el alcance cualitativo (instalación, garantía, soporte)."""

    cumple: bool
    faltantes: list[str] = Field(default_factory=list)
    evidencia: list[str] = Field(default_factory=list)
