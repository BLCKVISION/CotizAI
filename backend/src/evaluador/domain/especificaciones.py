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
SOCKET_CPU = "socket_cpu"
SOCKET_PLACA = "socket_placa"
TIPO_RAM = "tipo_ram"
TIPO_RAM_PLACA = "tipo_ram_placa"
FORMATO_RAM = "formato_ram"
FORMATO_RAM_PLACA = "formato_ram_placa"
LONGITUD_GPU_MM = "longitud_gpu_mm"
MAX_GPU_MM = "max_gpu_mm"
CPU_TDP_W = "cpu_tdp_w"
GPU_TDP_W = "gpu_tdp_w"
POTENCIA_FUENTE_W = "potencia_fuente_w"
POTENCIA_UPS_W = "potencia_ups_w"  # vatios reales (no VA)
POTENCIA_UPS_VA = "potencia_ups_va"
CONDICION = "condicion"  # nuevo | usado | reacondicionado ...
ANIO_LANZAMIENTO = "anio_lanzamiento"

CLAVES_CANONICAS = (
    SOCKET_CPU, SOCKET_PLACA, TIPO_RAM, TIPO_RAM_PLACA, FORMATO_RAM, FORMATO_RAM_PLACA, LONGITUD_GPU_MM,
    MAX_GPU_MM, CPU_TDP_W, GPU_TDP_W, POTENCIA_FUENTE_W, POTENCIA_UPS_W, POTENCIA_UPS_VA, CONDICION,
    ANIO_LANZAMIENTO,
)  # fmt: skip

# Unidades aceptadas por magnitud (unidad -> factor a la unidad base). Sin unidad se asume la base.
VATIOS: Mapping[str, Decimal] = {"w": Decimal(1), "kw": Decimal(1000)}
MILIMETROS: Mapping[str, Decimal] = {"mm": Decimal(1), "cm": Decimal(10), "m": Decimal(1000)}

_MEDIDA = re.compile(r"^\s*(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*([a-zA-Z]{0,3})\s*$")
_MILES = re.compile(r"^[1-9]\d{0,2}(?:[.,]\d{3})+$")
_DDR = re.compile(r"(lp)?ddr\s*-?\s*(\d)")
_SOCKET = re.compile(r"\b(lga|pga|bga|fclga|am|fm|str|sp|tr)\s*-?\s*(\d{1,4}[a-z]?)\b")
_ANIO = re.compile(r"(?<!\d)((?:19|20)\d{2})(?!\d)")
_MAX_EXPONENTE = 30


def sin_acentos(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", texto) if not unicodedata.combining(c))


def normalizar_texto(texto: str) -> str:
    """Minúsculas, sin acentos y solo letras/dígitos: 'LGA 1700' y 'lga-1700' -> 'lga1700'."""
    return re.sub(r"[^a-z0-9]", "", sin_acentos(texto).lower())


def leer_medida(texto: str | None, unidades: Mapping[str, Decimal]) -> Decimal | None:
    """Lee una medida **completa** ('650 W', '1.200 W', '30 cm') y la lleva a la unidad base.

    Solo acepta «número + unidad opcional». Todo lo demás ('2 x 500 W', '1500VA/900W', 'Max-330mm', '450W (80+)',
    una unidad desconocida) devuelve `None` en vez de quedarse con un número cualquiera del texto.
    """
    if texto is None or (encontrado := _MEDIDA.match(texto)) is None:
        return None
    numero, unidad = encontrado.groups()
    factor = unidades.get(unidad.lower()) if unidad else Decimal(1)
    if factor is None:
        return None
    # '1.200' y '1,200' son miles; '1.5' y '0,5' son decimales.
    limpio = re.sub(r"[.,]", "", numero) if _MILES.match(numero) else numero.replace(",", ".")
    try:
        valor = Decimal(limpio) * factor
    except InvalidOperation:  # pragma: no cover - el patrón ya garantiza un número
        return None
    return valor if valor.is_finite() and valor.adjusted() <= _MAX_EXPONENTE else None


def leer_anio(texto: str | None) -> int | None:
    """Un único año de 4 dígitos. Rangos ('2016-2019') o varios años distintos son ambiguos: `None`."""
    if texto is None:
        return None
    anios = set(_ANIO.findall(texto))
    return int(anios.pop()) if len(anios) == 1 else None


def normalizar_socket(texto: str) -> str | None:
    """'Socket LGA 1700 (12th gen)' -> 'lga1700'. Dos sockets distintos en un valor son ambiguos: `None`."""
    limpio = sin_acentos(texto).lower()
    encontrados = {f"{familia}{numero}" for familia, numero in _SOCKET.findall(limpio)}
    if len(encontrados) == 1:
        return encontrados.pop()
    if encontrados:
        return None
    sin_palabra = re.sub(r"\b(socket|zocalo)\b", "", limpio)
    return normalizar_texto(sin_palabra) or None


def normalizar_tipo_ram(texto: str) -> str | None:
    """'DDR4-3200' -> 'ddr4'. Varias generaciones ('DDR4/DDR5') o LPDDR (soldada) no se comparan: `None`."""
    encontrados = _DDR.findall(sin_acentos(texto).lower())
    if not encontrados or any(lp for lp, _ in encontrados):
        return None
    generaciones = {gen for _, gen in encontrados}
    return f"ddr{generaciones.pop()}" if len(generaciones) == 1 else None


def normalizar_formato_ram(texto: str) -> str | None:
    """'SO-DIMM' -> 'sodimm'; 'RDIMM'/'LRDIMM' -> 'rdimm'; 'UDIMM'/'DIMM' -> 'dimm' (escritorio sin buffer)."""
    limpio = normalizar_texto(texto)
    for marca, formato in (("sodimm", "sodimm"), ("lrdimm", "rdimm"), ("rdimm", "rdimm"), ("dimm", "dimm")):
        if marca in limpio:
            return formato
    return None


def recortar(texto: str, largo: int = 60) -> str:
    """Los valores del documento se citan acotados: el motivo del hallazgo no debe poder crecer sin límite."""
    texto = " ".join(texto.split())
    return texto if len(texto) <= largo else texto[: largo - 1] + "…"
