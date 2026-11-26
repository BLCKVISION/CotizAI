"""Alcance verificable con lista fija: 11 equipos completos. Lo cualitativo lo juzga el modelo con evidencia."""

from __future__ import annotations

import unicodedata
from decimal import Decimal, InvalidOperation

from evaluador.domain.evaluacion import CodigoHallazgo, Hallazgo, Origen, Severidad
from evaluador.domain.extraccion import ExtraccionPropuesta

EQUIPOS_REQUERIDOS = 11
CATEGORIAS_REQUERIDAS = ("gabinete", "monitor", "teclado", "raton", "protector")
_SINONIMOS = {"mouse": "raton", "cpu": "gabinete", "torre": "gabinete", "case": "gabinete", "pantalla": "monitor"}


def normalizar_categoria(texto: str) -> str:
    """Minúsculas, sin acentos ni plural simple: 'Ratón', 'ratones' y 'mouse' -> 'raton'."""
    t = "".join(c for c in unicodedata.normalize("NFKD", texto.strip().lower()) if not unicodedata.combining(c))
    for sufijo in ("es", "s"):
        if (
            t.endswith(sufijo)
            and t not in CATEGORIAS_REQUERIDAS
            and t[: -len(sufijo)]
            in {
                *CATEGORIAS_REQUERIDAS,
                *_SINONIMOS,
            }
        ):
            t = t[: -len(sufijo)]
            break
    return _SINONIMOS.get(t, t)


def _cantidad(valor: str) -> Decimal | None:
    try:
        d = Decimal(valor)
    except (InvalidOperation, ValueError):
        return None
    return d if d.is_finite() and d >= 0 and d.adjusted() <= 30 else None


def validar_alcance_fijo(e: ExtraccionPropuesta, equipos: int = EQUIPOS_REQUERIDOS) -> list[Hallazgo]:
    por_categoria: dict[str, Decimal] = {}
    con_cantidad_ilegible: set[str] = set()
    for ln in e.lineas:
        categoria = normalizar_categoria(ln.categoria)
        cantidad = _cantidad(ln.cantidad.valor if ln.cantidad else "")
        if cantidad is None:
            con_cantidad_ilegible.add(categoria)
            continue
        por_categoria[categoria] = por_categoria.get(categoria, Decimal(0)) + cantidad
    faltan = [c for c in CATEGORIAS_REQUERIDAS if por_categoria.get(c, Decimal(0)) < equipos]
    # Una cantidad ilegible no prueba que falte nada: va a revisión humana, no descarta.
    dudosas = [c for c in faltan if c in con_cantidad_ilegible]
    firmes = [c for c in faltan if c not in con_cantidad_ilegible]
    hallazgos: list[Hallazgo] = []
    if firmes:
        hallazgos.append(
            Hallazgo(
                CodigoHallazgo.ALCANCE,
                Severidad.CRITICA,
                True,
                f"No cubre {equipos} unidades de: {', '.join(firmes)}.",
                "lista fija de requisitos",
                Origen.REGLA,
            )
        )
    if dudosas:
        hallazgos.append(
            Hallazgo(
                CodigoHallazgo.LECTURA,
                Severidad.ADVERTENCIA,
                False,
                f"Cantidad ilegible; no se puede verificar {equipos} unidades de: {', '.join(dudosas)}.",
                "lista fija de requisitos",
                Origen.REGLA,
            )
        )
    return hallazgos
