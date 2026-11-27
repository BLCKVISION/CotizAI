"""Checks that need the whole computer, for quotes that list one component per line.

The same-line rules cannot see that a graphics card on one line does not fit the case, or is not fed by the power
supply, quoted on other lines. Here the lines of each station (students, teacher) are judged together.

Power figures are the manufacturers' published base or board power. Unknown parts are never guessed: without a
recognised graphics card and a stated wattage nothing is concluded.
"""

from __future__ import annotations

import re
from decimal import Decimal

from evaluador.domain.document_text import plain, visible_text
from evaluador.domain.evaluacion import CodigoHallazgo, Hallazgo, Origen, Severidad
from evaluador.domain.extraccion import ExtraccionPropuesta, Linea

# Most specific names first.
_GPU_WATTS: tuple[tuple[str, int], ...] = (
    (r"rtx\s*4090", 450), (r"rtx\s*4080", 320), (r"rtx\s*4070\s*ti", 285), (r"rtx\s*4070\s*super", 220),
    (r"rtx\s*4070", 200), (r"rtx\s*4060\s*ti", 160), (r"rtx\s*4060", 115), (r"rtx\s*3060\s*ti", 200),
    (r"rtx\s*3060", 170), (r"rtx\s*3050", 70), (r"rtx\s*4000\s*ada", 130), (r"rtx\s*2000\s*ada", 70),
    (r"rtx\s*a\s*2000", 70), (r"rx\s*7800\s*xt", 263), (r"rx\s*7600", 165),
)  # fmt: skip
_CPU_WATTS: tuple[tuple[str, int], ...] = (
    (r"7950x", 170), (r"7900x", 170), (r"ryzen\s*9\s*7900\b", 65), (r"7700x", 105), (r"ryzen\s*7\s*7700\b", 65),
    (r"7600x", 105), (r"ryzen\s*5\s*7600\b", 65), (r"i[3579]-1[2-4]\d00k", 125), (r"i[3579]-1[2-4]\d00f?\b", 65),
)  # fmt: skip
_BASE_WATTS, _MONITOR_WATTS, _MARGIN = Decimal(100), Decimal(40), Decimal("1.25")

_TEACHER = re.compile(r"\b(?:doc(?:ente)?|profesor)\b")
_SUPPLY_PART = re.compile(r"\b(?:fuente|psu|80\s*\+|80 plus)")
_UPS_PART = re.compile(r"\bups\b")
_WATTS = re.compile(r"(?<![\w.,])(\d{3,4})\s*w\b")
_SMALL_CASE = re.compile(r"(?:solo|solamente|unicamente)[^|]{0,30}low[- ]?profile|"
                         r"(?:solo|solamente|unicamente)[^|]{0,30}perfil bajo")  # fmt: skip
_BIG_CARD = re.compile(r"\b(?:triple[- ]?fan|triple ventilador|3 ventiladores|(?:2[5-9]\d|3\d\d)\s*mm)")
_UNDEFINED = re.compile(
    r"\bsegun (?:el )?(?:lote|disponibilidad|stock)\b|\bmarcas varias\b|\bplacas? [^|.]{0,30}mixtas?\b|"
    r"\bcomponentes mixtos\b"
)


def _text(line: Linea) -> str:
    specs = " | ".join(f"{k} {v}" for k, v in line.especificaciones.items())
    return plain(f"{line.categoria} | {line.descripcion} | {line.evidencia.texto} | {specs}")


def station_lines(e: ExtraccionPropuesta) -> dict[str, list[str]]:
    """The text of every line, grouped by who uses the station."""
    grouped: dict[str, list[str]] = {}
    for line in e.lineas:
        text = _text(line)
        grouped.setdefault("docente" if _TEACHER.search(text) else "estudiantes", []).append(text)
    return grouped


def stations(e: ExtraccionPropuesta) -> dict[str, str]:
    return {name: " | ".join(texts) for name, texts in station_lines(e).items()}


def _strongest(table: tuple[tuple[str, int], ...], text: str) -> int | None:
    found = [watts for pattern, watts in table if re.search(pattern, text)]
    if not found:
        return None
    # A more general name also matches ("4070" inside "4070 ti"): the first entry is the specific one.
    return found[0]


def _least_demanding(table: tuple[tuple[str, int], ...], text: str) -> int | None:
    """Lowest published power among the models the document names: used only when the line itself omits the model,
    so a doubt never counts against the supplier."""
    found: list[int] = []
    for pattern, watts in table:  # specific names come first and are removed, so "4070 ti" is not also "4070"
        text, count = re.subn(pattern, " ", text)
        if count:
            found.append(watts)
    return min(found) if found else None


_GRAPHICS_LINE = re.compile(r"\b(?:gpu|tarjeta grafica|grafica)\b")
_PROCESSOR_LINE = re.compile(r"\b(?:cpu|procesador)\b")


def _stated_watts(text: str, part: re.Pattern[str]) -> int | None:
    values = {int(w) for piece in text.split("|") if part.search(piece) for w in _WATTS.findall(piece)}
    return min(values) if values else None


def _supply_watts(texts: list[str]) -> int | None:
    """Wattage of the computer's power supply, read line by line so a UPS rating is never taken for it."""
    values: set[int] = set()
    for text in texts:
        if not _SUPPLY_PART.search(text):
            continue
        pieces = text.split("|")
        if _UPS_PART.search(text):  # one line with both: only the parts that name the supply
            pieces = [p for p in pieces if _SUPPLY_PART.search(p) and not _UPS_PART.search(p)]
        values |= {int(w) for p in pieces for w in _WATTS.findall(p)}
    return min(values) if values else None


def _discard(code: CodigoHallazgo, reason: str, quote: str) -> Hallazgo:
    return Hallazgo(code, Severidad.CRITICA, True, reason, quote[:200], Origen.REGLA)


def validar_estaciones(e: ExtraccionPropuesta, document: str = "") -> list[Hallazgo]:
    found: list[Hallazgo] = []
    by_line = station_lines(e)
    whole = plain(visible_text(document)) if document else ""
    for name, text in stations(e).items():
        gpu, cpu = _strongest(_GPU_WATTS, text), _strongest(_CPU_WATTS, text)
        if gpu is None and _GRAPHICS_LINE.search(text):
            gpu = _least_demanding(_GPU_WATTS, whole)
        if cpu is None and _PROCESSOR_LINE.search(text):
            cpu = _least_demanding(_CPU_WATTS, whole)
        if gpu is not None and cpu is not None:
            load = Decimal(gpu + cpu) + _BASE_WATTS
            supply = _supply_watts(by_line[name])
            if supply is not None and supply < load * _MARGIN:
                found.append(_discard(
                    CodigoHallazgo.CAPACIDAD,
                    f"Puesto de {name}: la fuente de {supply} W no cubre el consumo estimado de {load} W con margen "
                    f"de {_MARGIN} (procesador {cpu} W, gráfica {gpu} W, resto {_BASE_WATTS} W).",
                    f"fuente de {supply} W",
                ))  # fmt: skip
            ups = _stated_watts(text, _UPS_PART)
            if ups is not None and ups < (load + _MONITOR_WATTS) * _MARGIN:
                found.append(_discard(
                    CodigoHallazgo.CAPACIDAD,
                    f"Puesto de {name}: la UPS de {ups} W no soporta el equipo y el monitor "
                    f"({load + _MONITOR_WATTS} W estimados, con margen de {_MARGIN}).",
                    f"UPS de {ups} W",
                ))  # fmt: skip
    everything = " | ".join([whole, *stations(e).values()])
    small, big = _SMALL_CASE.search(everything), _BIG_CARD.search(everything)
    if small and big:
        found.append(_discard(
            CodigoHallazgo.COMPAT,
            "El gabinete solo admite tarjetas de perfil bajo y se ofrece una tarjeta gráfica de tamaño completo.",
            f"{small.group(0)} | {big.group(0)}",
        ))  # fmt: skip
    if undefined := _UNDEFINED.search(everything):
        found.append(_discard(
            CodigoHallazgo.CALIDAD,
            "No se define qué se entrega (equipos mezclados o marcas sin especificar): no hay uniformidad ni se "
            "puede verificar la calidad.",
            undefined.group(0),
        ))  # fmt: skip
    return found
