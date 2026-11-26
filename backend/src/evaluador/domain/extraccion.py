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
    cantidad: Monto | None = None  # None = no consta (no se rellena con suposiciones)
    precio_unitario: Monto | None = None
    total_linea: Monto | None = None
    evidencia: Evidencia = Field(default_factory=Evidencia)
    legibilidad: Literal["alta", "media", "baja"] = "alta"


class Totales(_Base):
    subtotal: Monto | None = None
    impuestos: list[Monto] = Field(default_factory=list)
    total: Monto | None = None


class Recargo(_Base):
    """Cargo adicional. `monto` o `porcentaje`; si el cargo se anuncia sin cifra, el Monto lleva `valor` vacío."""

    concepto: str
    monto: Monto | None = None
    porcentaje: Monto | None = None  # sobre el subtotal


class Condiciones(_Base):
    """Costos y cláusulas fuera de las líneas. `None` = no consta; un Monto con `valor` no numérico = «a convenir»."""

    flete: Monto | None = None
    instalacion: Monto | None = None
    recargos: list[Recargo] = Field(default_factory=list)
    garantia: str | None = None
    soporte: str | None = None
    software: list[str] = Field(default_factory=list)


class ExtraccionPropuesta(_Base):
    proveedor: str | None = None
    moneda: str | None = None
    lineas: list[Linea] = Field(default_factory=list)
    totales: Totales = Field(default_factory=Totales)
    condiciones: Condiciones = Field(default_factory=Condiciones)
    notas_literales: list[str] = Field(default_factory=list)
    sospechas_de_manipulacion: list[str] = Field(default_factory=list)


class JuicioDeAlcance(_Base):
    """Salida del modelo para el alcance cualitativo (instalación, garantía, soporte)."""

    cumple: bool
    faltantes: list[str] = Field(default_factory=list)
    evidencia: list[str] = Field(default_factory=list)


class TranscripcionImagen(_Base):
    """Salida del modelo de visión: transcripción literal de una imagen (foto o captura de una propuesta)."""

    texto: str = ""
    ilegible: bool = False  # True si la imagen no permite leer con fiabilidad: se pide revisión, no se inventa
