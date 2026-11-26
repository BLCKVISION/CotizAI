"""Alcance verificable con lista fija: 11 equipos completos. Lo cualitativo lo juzga el modelo con evidencia."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation

from evaluador.domain.evaluacion import CodigoHallazgo, Hallazgo, Origen, Severidad
from evaluador.domain.extraccion import ExtraccionPropuesta

EQUIPOS_REQUERIDOS = 11
CATEGORIAS_REQUERIDAS = ("gabinete", "monitor", "teclado", "raton", "protector")


def validar_alcance_fijo(e: ExtraccionPropuesta, equipos: int = EQUIPOS_REQUERIDOS) -> list[Hallazgo]:
    por_categoria: dict[str, Decimal] = {}
    for ln in e.lineas:
        try:
            por_categoria[ln.categoria.lower()] = por_categoria.get(ln.categoria.lower(), Decimal(0)) + Decimal(
                ln.cantidad.valor
            )
        except InvalidOperation:
            continue
    faltan = [c for c in CATEGORIAS_REQUERIDAS if por_categoria.get(c, Decimal(0)) < equipos]
    if not faltan:
        return []
    return [
        Hallazgo(
            CodigoHallazgo.ALCANCE,
            Severidad.CRITICA,
            True,
            f"No cubre {equipos} unidades de: {', '.join(faltan)}.",
            "lista fija de requisitos",
            Origen.REGLA,
        )
    ]
