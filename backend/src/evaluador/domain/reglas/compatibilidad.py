"""COMPAT: componentes incompatibles dentro de una misma línea (socket, RAM, espacio para tarjeta gráfica).

Solo compara pares de especificaciones de la **misma línea**: mezclar líneas de equipos distintos daría falsos
descartes. Si falta una de las dos mitades del par, no se descarta: se pide revisión (el plan manda buscar la
especificación en una fuente técnica antes de concluir).
"""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass

from evaluador.domain import especificaciones as esp
from evaluador.domain.evaluacion import CodigoHallazgo, Hallazgo, Origen, Severidad
from evaluador.domain.extraccion import ExtraccionPropuesta, Linea


@dataclass(frozen=True, slots=True)
class _ParDeTexto:
    componente: str
    soporte: str
    nombre: str
    normalizar: Callable[[str], str | None]


_PARES = (
    _ParDeTexto(esp.SOCKET_CPU, esp.SOCKET_PLACA, "socket", esp.normalizar_socket),
    _ParDeTexto(esp.TIPO_RAM, esp.TIPO_RAM_PLACA, "tipo de RAM", esp.normalizar_tipo_ram),
    _ParDeTexto(esp.FORMATO_RAM, esp.FORMATO_RAM_PLACA, "formato de RAM", esp.normalizar_formato_ram),
)


def _cita(linea: Linea) -> str:
    return (linea.evidencia.texto or linea.descripcion)[:200]


def _revisar(motivo: str, linea: Linea) -> Hallazgo:
    return Hallazgo(CodigoHallazgo.LECTURA, Severidad.ADVERTENCIA, False, motivo, _cita(linea), Origen.REGLA)


def _incompatible(motivo: str, linea: Linea) -> Hallazgo:
    return Hallazgo(CodigoHallazgo.COMPAT, Severidad.CRITICA, True, motivo, _cita(linea), Origen.REGLA)


def _comparar_texto(n: int, linea: Linea, par: _ParDeTexto) -> list[Hallazgo]:
    a, b = linea.especificaciones.get(par.componente), linea.especificaciones.get(par.soporte)
    if a is None and b is None:
        return []  # la línea no habla de este par
    if a is None or b is None:
        falta = par.componente if a is None else par.soporte
        return [
            _revisar(
                f"Línea {n}: falta '{falta}'; no se puede verificar el {par.nombre}. Consulte la ficha técnica.", linea
            )
        ]
    na, nb = par.normalizar(a), par.normalizar(b)
    if na is None or nb is None:
        return [
            _revisar(f"Línea {n}: el {par.nombre} no es interpretable ({esp.recortar(a)} / {esp.recortar(b)}).", linea)
        ]
    if na != nb:
        return [
            _incompatible(
                f"Línea {n}: {par.nombre} del componente ({esp.recortar(a)}) no coincide con el de la placa "
                f"({esp.recortar(b)}).",
                linea,
            )
        ]
    return []


_STATED_SOCKET = re.compile(r"\b(?:socket|zocalo)\s*:?\s*((?:lga|am|fm|str|tr|sp)\s*-?\s*\d{1,4}[a-z]?)\b")
_PROCESSOR_WORDS = re.compile(
    r"\b(?:cpu|procesador|ryzen|athlon|threadripper|xeon|pentium|celeron|core\s+(?:ultra|i\d))\b"
)
_BOARD_WORDS = re.compile(r"\b(?:placa|tarjeta\s+madre|motherboard|mainboard|board|[abhqxz][1-9]\d0[a-z]?)\b")


def _stated_sockets(linea: Linea) -> dict[str, str]:
    """Sockets the document writes out for both the processor and the board of one line.

    Models do not reliably use the canonical keys, so this reads each specification and each part of the quoted
    text. It answers only when both sides are unambiguous: otherwise nothing is added, not even a review notice.
    """
    parts = [f"{key}: {value}" for key, value in linea.especificaciones.items()]
    parts += re.split(r"[|\n]", linea.evidencia.texto)
    found: dict[str, set[str]] = {esp.SOCKET_CPU: set(), esp.SOCKET_PLACA: set()}
    for part in parts:
        text = esp.sin_acentos(part).lower()
        sockets = {esp.normalizar_texto(s) for s in _STATED_SOCKET.findall(text)}
        processor, board = bool(_PROCESSOR_WORDS.search(text)), bool(_BOARD_WORDS.search(text))
        if len(sockets) == 1 and processor != board:  # a part naming both or neither says nothing about which
            found[esp.SOCKET_CPU if processor else esp.SOCKET_PLACA] |= sockets
    if any(len(values) != 1 for values in found.values()):
        return {}
    return {key: f"Socket {values.pop().upper()}" for key, values in found.items()}


def _with_stated_sockets(linea: Linea) -> Linea:
    if linea.especificaciones.get(esp.SOCKET_CPU) and linea.especificaciones.get(esp.SOCKET_PLACA):
        return linea  # the extraction already gave both
    stated = _stated_sockets(linea)
    return linea.model_copy(update={"especificaciones": linea.especificaciones | stated}) if stated else linea


def _comparar_gpu(n: int, linea: Linea) -> list[Hallazgo]:
    tarjeta, maximo = linea.especificaciones.get(esp.LONGITUD_GPU_MM), linea.especificaciones.get(esp.MAX_GPU_MM)
    if tarjeta is None and maximo is None:
        return []
    largo, limite = esp.leer_medida(tarjeta, esp.MILIMETROS), esp.leer_medida(maximo, esp.MILIMETROS)
    if largo is None or limite is None:
        return [
            _revisar(f"Línea {n}: falta o es ilegible el largo de la tarjeta gráfica o el máximo del gabinete.", linea)
        ]
    if largo > limite:
        return [
            _incompatible(
                f"Línea {n}: la tarjeta gráfica mide {largo} mm y el gabinete admite hasta {limite} mm.", linea
            )
        ]
    return []


def validar_compatibilidad(e: ExtraccionPropuesta) -> list[Hallazgo]:
    hallazgos: list[Hallazgo] = []
    for n, original in enumerate(e.lineas, start=1):
        linea = _with_stated_sockets(original)
        for par in _PARES:
            hallazgos += _comparar_texto(n, linea, par)
        hallazgos += _comparar_gpu(n, linea)
    return hallazgos
