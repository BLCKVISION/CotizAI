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


# After the word "socket" any family counts; alone, only the unmistakable ones ("(AM5)", "LGA1700").
_STATED_SOCKET = re.compile(
    r"\b(?:(?:socket|zocalo)\s*(?::\s*)?((?:lga|am|fm|str|tr|sp)\s*(?:-\s*)?\d{1,4}[a-z]?)|(am[45]|lga\s*(?:-\s*)?\d{4}))\b"
)
_PROCESSOR_WORDS = re.compile(
    r"\b(?:cpu|procesador|ryzen|athlon|threadripper|xeon|pentium|celeron|core\s+(?:ultra|i\d)|i[3579]-\d{4,5}[a-z]{0,2})\b"
)
_BOARD_WORDS = re.compile(r"\b(?:placa|tarjeta\s+madre|motherboard|mainboard|board|[abhqxz][1-9]\d0[a-z]?)\b")


def _parts(linea: Linea) -> list[str]:
    """Each specification and each part of the quoted text, so one part talks about one component."""
    specs = [f"{key}: {value}" for key, value in linea.especificaciones.items()]
    return specs + re.split(r"[|\n]", linea.evidencia.texto) + re.split(r"[|\n]", linea.descripcion)


def _components(linea: Linea) -> list[str]:
    """Narrower pieces, for quotes that list a whole computer separated by commas."""
    return [piece for part in _parts(linea) for piece in re.split(r"[,;]", part)]


def _sockets_by_side(linea: Linea) -> dict[str, dict[str, str]]:
    """side -> {socket: the part that states it}."""
    found: dict[str, dict[str, str]] = {esp.SOCKET_CPU: {}, esp.SOCKET_PLACA: {}}
    for part in _components(linea):
        text = esp.sin_acentos(part).lower()
        sockets = {esp.normalizar_texto(a or b) for a, b in _STATED_SOCKET.findall(text)}
        processor, board = bool(_PROCESSOR_WORDS.search(text)), bool(_BOARD_WORDS.search(text))
        if len(sockets) == 1 and processor != board:  # a part naming both or neither says nothing about which
            found[esp.SOCKET_CPU if processor else esp.SOCKET_PLACA].setdefault(sockets.pop(), part.strip())
    return found


def _stated_sockets(linea: Linea) -> dict[str, str]:
    """Sockets the document writes out for both the processor and the board of one line.

    Models do not reliably use the canonical keys, so the text is read here. It answers only when both sides are
    unambiguous: otherwise nothing is added, not even a review notice.
    """
    found = _sockets_by_side(linea)
    if any(len(values) != 1 for values in found.values()):
        return {}
    return {key: f"Socket {next(iter(values)).upper()}" for key, values in found.items()}


# Platforms whose processors accept a single memory generation. Others (e.g. LGA1700) accept two.
_ONLY_MEMORY = {"am4": "ddr4", "am5": "ddr5", "lga1851": "ddr5"}
_RAM_WORDS = re.compile(r"\b(?:ram|memoria)\b")
_GENERATION = re.compile(r"\bddr\s*(?:-\s*)?([2-5])(?![0-9])")  # not GDDR (graphics) nor LPDDR
_SIZE_AND_GENERATION = re.compile(r"\b\d{1,3}\s*gb\s*(?:\(\s*)?(?:de\s+)?ddr\s*(?:-\s*)?[2-5]")
_BOARD_SUFFIX = re.compile(r"\bd([45])\b")  # board models such as "B760M-A D4"
_MODULES = re.compile(r"\b([1-8])\s*x\s*(\d{1,3})\s*gb\b")
_SLOTS = re.compile(r"\b([1-8])\s*(?:x\s*)?dimm\b|\b([1-8])\s+(?:slots?|ranuras?)\b(?!\s+libres)")
_BOARD_MAXIMUM = re.compile(r"\bmax(?:imo)?\.?\s*(?::\s*)?(\d{1,4})\s*gb\b")
_CAPABILITY_WORDS = re.compile(r"\b(?:soporta|compatible|admite|hasta|expandible|ampliable|slots?|ranuras?)\b")


def _offered_memory(linea: Linea) -> dict[str, str]:
    """{memory generation offered: the part that states it}, ignoring what a board merely supports."""
    offered: dict[str, str] = {}
    for part in _components(linea):
        text = esp.sin_acentos(part).lower()
        names_ram = _RAM_WORDS.search(text) or _SIZE_AND_GENERATION.search(text)
        if names_ram and not _BOARD_WORDS.search(text) and not _CAPABILITY_WORDS.search(text):
            for generation in _GENERATION.findall(text):
                offered.setdefault(f"ddr{generation}", part.strip())
    canonical = linea.especificaciones.get(esp.TIPO_RAM)
    if canonical and (generation := esp.normalizar_tipo_ram(canonical)):
        offered.setdefault(generation, canonical)
    return offered


def _check_platform_memory(n: int, linea: Linea) -> list[Hallazgo]:
    """The processor itself fixes the memory generation, whether or not the board is described."""
    processors = _sockets_by_side(linea)[esp.SOCKET_CPU]
    canonical = linea.especificaciones.get(esp.SOCKET_CPU)
    if canonical and (socket := esp.normalizar_socket(canonical)):
        processors.setdefault(socket, canonical)
    memory = _offered_memory(linea)
    if len(processors) != 1 or len(memory) != 1:
        return []
    (socket, processor_quote), (offered, memory_quote) = *processors.items(), *memory.items()
    required = _ONLY_MEMORY.get(socket)
    if required is None or offered == required:
        return []
    reason = (
        f"Línea {n}: el procesador usa socket {socket.upper()}, que solo admite memoria {required.upper()}, y la "
        f"propuesta ofrece {offered.upper()}."
    )
    quote = f"{processor_quote} | {memory_quote}"[:200]
    return [Hallazgo(CodigoHallazgo.COMPAT, Severidad.CRITICA, True, reason, quote, Origen.REGLA)]


def _with_stated_sockets(linea: Linea) -> Linea:
    if linea.especificaciones.get(esp.SOCKET_CPU) and linea.especificaciones.get(esp.SOCKET_PLACA):
        return linea  # the extraction already gave both
    stated = _stated_sockets(linea)
    return linea.model_copy(update={"especificaciones": linea.especificaciones | stated}) if stated else linea


def _board_memory(linea: Linea) -> dict[str, str]:
    """{memory generation the board is made for: the part that states it}."""
    found: dict[str, str] = {}
    for part in _components(linea):
        text = esp.sin_acentos(part).lower()
        if _BOARD_WORDS.search(text) and not _CAPABILITY_WORDS.search(text):
            generations = _GENERATION.findall(text) + _BOARD_SUFFIX.findall(text)
            for generation in generations:
                found.setdefault(f"ddr{generation}", part.strip())
    return found


def _check_board_memory(n: int, linea: Linea) -> list[Hallazgo]:
    board, memory = _board_memory(linea), _offered_memory(linea)
    if len(board) != 1 or len(memory) != 1:
        return []
    (made_for, board_quote), (offered, memory_quote) = *board.items(), *memory.items()
    if made_for == offered:
        return []
    reason = (
        f"Línea {n}: la tarjeta madre es para memoria {made_for.upper()} y la propuesta ofrece {offered.upper()}."
    )
    quote = f"{board_quote} | {memory_quote}"[:200]
    return [Hallazgo(CodigoHallazgo.COMPAT, Severidad.CRITICA, True, reason, quote, Origen.REGLA)]


def _check_memory_fits(n: int, linea: Linea) -> list[Hallazgo]:
    """More modules than the board has slots, or more gigabytes than it accepts."""
    modules: dict[tuple[int, int], str] = {}
    slots: dict[int, str] = {}
    maximum: dict[int, str] = {}
    for part in _parts(linea):
        text = esp.sin_acentos(part).lower()
        if _BOARD_WORDS.search(text) or "dimm" in text and not _RAM_WORDS.search(text):
            for a, b in _SLOTS.findall(text):
                slots.setdefault(int(a or b), part.strip())
            for gigabytes in _BOARD_MAXIMUM.findall(text):
                maximum.setdefault(int(gigabytes), part.strip())
        elif _RAM_WORDS.search(text):
            for count, size in _MODULES.findall(text):
                modules.setdefault((int(count), int(size)), part.strip())
    if len(modules) != 1:
        return []
    ((count, size), memory_quote) = next(iter(modules.items()))
    problems = []
    if len(slots) == 1 and count > next(iter(slots)):
        problems.append((f"{count} módulos de memoria no caben en {next(iter(slots))} ranuras", slots))
    if len(maximum) == 1 and count * size > next(iter(maximum)):
        limit = next(iter(maximum))
        problems.append((f"{count * size} GB superan el máximo de {limit} GB de la tarjeta madre", maximum))
    if not problems:
        return []
    reason = f"Línea {n}: " + " y ".join(text for text, _ in problems) + "."
    quote = f"{memory_quote} | {next(iter(problems[0][1].values()))}"[:200]
    return [Hallazgo(CodigoHallazgo.COMPAT, Severidad.CRITICA, True, reason, quote, Origen.REGLA)]


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
        hallazgos += _check_platform_memory(n, original)
        hallazgos += _check_board_memory(n, original)
        hallazgos += _check_memory_fits(n, original)
    return hallazgos
