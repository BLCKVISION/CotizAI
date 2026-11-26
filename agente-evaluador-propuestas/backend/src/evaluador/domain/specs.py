"""Vocabulario común de `Linea.especificaciones` y utilidades para leerlo.

Las especificaciones llegan de un documento no confiable y del modelo, así que son texto libre: aquí se
fijan las **claves canónicas** que el prompt de extracción debe usar y cómo se normalizan los valores.

Principio: ante la duda, `None` («no consta / no interpretable»). Quien llama lo convierte en una revisión humana;
un parser que «adivina» produce descartes falsos, y en una licitación pública eso es lo más grave.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Mapping
from decimal import Decimal, InvalidOperation

# --- claves canónicas ---------------------------------------------------------------------------------
CPU_SOCKET = "cpu_socket"
BOARD_SOCKET = "board_socket"
RAM_TYPE = "ram_type"
BOARD_RAM_TYPE = "board_ram_type"
RAM_FORMAT = "ram_format"
BOARD_RAM_FORMAT = "board_ram_format"
GPU_LENGTH_MM = "gpu_length_mm"
MAX_GPU_MM = "max_gpu_mm"
CPU_TDP_W = "cpu_tdp_w"
GPU_TDP_W = "gpu_tdp_w"
PSU_POWER_W = "psu_power_w"
UPS_POWER_W = "ups_power_w"  # vatios reales (no VA)
UPS_POWER_VA = "ups_power_va"
CONDITION = "condition"  # nuevo | usado | reacondicionado ...
RELEASE_YEAR = "release_year"

CANONICAL_KEYS = (
    CPU_SOCKET, BOARD_SOCKET, RAM_TYPE, BOARD_RAM_TYPE, RAM_FORMAT, BOARD_RAM_FORMAT, GPU_LENGTH_MM,
    MAX_GPU_MM, CPU_TDP_W, GPU_TDP_W, PSU_POWER_W, UPS_POWER_W, UPS_POWER_VA, CONDITION,
    RELEASE_YEAR,
)  # fmt: skip

# Unidades aceptadas por magnitud (unidad -> factor a la unidad base). Sin unidad se asume la base.
WATTS: Mapping[str, Decimal] = {"w": Decimal(1), "kw": Decimal(1000)}
MILLIMETERS: Mapping[str, Decimal] = {"mm": Decimal(1), "cm": Decimal(10), "m": Decimal(1000)}

_MEASURE = re.compile(r"^\s*(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*([a-zA-Z]{0,3})\s*$")
_THOUSANDS = re.compile(r"^[1-9]\d{0,2}(?:[.,]\d{3})+$")
_DDR = re.compile(r"(lp)?ddr\s*-?\s*(\d)")
_SOCKET = re.compile(r"\b(lga|pga|bga|fclga|am|fm|str|sp|tr)\s*-?\s*(\d{1,4}[a-z]?)\b")
_YEAR = re.compile(r"(?<!\d)((?:19|20)\d{2})(?!\d)")
_MAX_EXPONENT = 30


def strip_accents(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))


def normalize_text(text: str) -> str:
    """Minúsculas, sin acentos y solo letras/dígitos: 'LGA 1700' y 'lga-1700' -> 'lga1700'."""
    return re.sub(r"[^a-z0-9]", "", strip_accents(text).lower())


def read_measure(text: str | None, units: Mapping[str, Decimal]) -> Decimal | None:
    """Lee una medida **completa** ('650 W', '1.200 W', '30 cm') y la lleva a la unidad base.

    Solo acepta «número + unidad opcional». Todo lo demás ('2 x 500 W', '1500VA/900W', 'Max-330mm', '450W (80+)',
    una unidad desconocida) devuelve `None` en vez de quedarse con un número cualquiera del texto.
    """
    if text is None or (found := _MEASURE.match(text)) is None:
        return None
    number, unit = found.groups()
    factor = units.get(unit.lower()) if unit else Decimal(1)
    if factor is None:
        return None
    # '1.200' y '1,200' son miles; '1.5' y '0,5' son decimales.
    clean = re.sub(r"[.,]", "", number) if _THOUSANDS.match(number) else number.replace(",", ".")
    try:
        value = Decimal(clean) * factor
    except InvalidOperation:  # pragma: no cover - el patrón ya garantiza un número
        return None
    return value if value.is_finite() and value.adjusted() <= _MAX_EXPONENT else None


def read_year(text: str | None) -> int | None:
    """Un único año de 4 dígitos. Rangos ('2016-2019') o varios años distintos son ambiguos: `None`."""
    if text is None:
        return None
    years = set(_YEAR.findall(text))
    return int(years.pop()) if len(years) == 1 else None


def normalize_socket(text: str) -> str | None:
    """'Socket LGA 1700 (12th gen)' -> 'lga1700'. Dos sockets distintos en un valor son ambiguos: `None`."""
    clean = strip_accents(text).lower()
    found = {f"{family}{number}" for family, number in _SOCKET.findall(clean)}
    if len(found) == 1:
        return found.pop()
    if found:
        return None
    without_word = re.sub(r"\b(socket|zocalo)\b", "", clean)
    return normalize_text(without_word) or None


def normalize_ram_type(text: str) -> str | None:
    """'DDR4-3200' -> 'ddr4'. Varias generaciones ('DDR4/DDR5') o LPDDR (soldada) no se comparan: `None`."""
    found = _DDR.findall(strip_accents(text).lower())
    if not found or any(lp for lp, _ in found):
        return None
    generations = {gen for _, gen in found}
    return f"ddr{generations.pop()}" if len(generations) == 1 else None


def normalize_ram_format(text: str) -> str | None:
    """'SO-DIMM' -> 'sodimm'; 'RDIMM'/'LRDIMM' -> 'rdimm'; 'UDIMM'/'DIMM' -> 'dimm' (escritorio sin buffer)."""
    clean = normalize_text(text)
    for brand, format in (("sodimm", "sodimm"), ("lrdimm", "rdimm"), ("rdimm", "rdimm"), ("dimm", "dimm")):
        if brand in clean:
            return format
    return None


def trim(text: str, length: int = 60) -> str:
    """Los valores del documento se citan acotados: el motivo del hallazgo no debe poder crecer sin límite."""
    text = " ".join(text.split())
    return text if len(text) <= length else text[: length - 1] + "…"
