"""COMPAT: componentes incompatibles dentro de una misma línea (socket, RAM, espacio para tarjeta gráfica).

Solo compara pares de especificaciones de la **misma línea**: mezclar líneas de equipos distintos daría falsos
descartes. Si falta una de las dos mitades del par, no se descarta: se pide revisión (el plan manda buscar la
especificación en una fuente técnica antes de concluir).
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from evaluador.domain import specs as spec
from evaluador.domain.evaluation import Finding, FindingCode, Origin, Severity
from evaluador.domain.extraction import Line, ProposalExtraction


@dataclass(frozen=True, slots=True)
class _TextPair:
    component: str
    support: str
    name: str
    normalize: Callable[[str], str | None]


_PAIRS = (
    _TextPair(spec.CPU_SOCKET, spec.BOARD_SOCKET, "socket", spec.normalize_socket),
    _TextPair(spec.RAM_TYPE, spec.BOARD_RAM_TYPE, "tipo de RAM", spec.normalize_ram_type),
    _TextPair(spec.RAM_FORMAT, spec.BOARD_RAM_FORMAT, "formato de RAM", spec.normalize_ram_format),
)


def _quote(line: Line) -> str:
    return (line.evidence.text or line.description)[:200]


def _review(reason: str, line: Line) -> Finding:
    return Finding(FindingCode.LECTURA, Severity.WARNING, False, reason, _quote(line), Origin.RULE)


def _incompatible(reason: str, line: Line) -> Finding:
    return Finding(FindingCode.COMPAT, Severity.CRITICAL, True, reason, _quote(line), Origin.RULE)


def _compare_text(n: int, line: Line, par: _TextPair) -> list[Finding]:
    a, b = line.specs.get(par.component), line.specs.get(par.support)
    if a is None and b is None:
        return []  # la línea no habla de este par
    if a is None or b is None:
        missing = par.component if a is None else par.support
        return [
            _review(
                f"Línea {n}: falta '{missing}'; no se puede verificar el {par.name}. Consulte la ficha técnica.", line
            )
        ]
    na, nb = par.normalize(a), par.normalize(b)
    if na is None or nb is None:
        return [_review(f"Línea {n}: el {par.name} no es interpretable ({spec.trim(a)} / {spec.trim(b)}).", line)]
    if na != nb:
        return [
            _incompatible(
                f"Línea {n}: {par.name} del componente ({spec.trim(a)}) no coincide con el de la placa "
                f"({spec.trim(b)}).",
                line,
            )
        ]
    return []


def _compare_gpu(n: int, line: Line) -> list[Finding]:
    card, maximum = line.specs.get(spec.GPU_LENGTH_MM), line.specs.get(spec.MAX_GPU_MM)
    if card is None and maximum is None:
        return []
    length, limit = spec.read_measure(card, spec.MILLIMETERS), spec.read_measure(maximum, spec.MILLIMETERS)
    if length is None or limit is None:
        return [
            _review(f"Línea {n}: falta o es ilegible el largo de la tarjeta gráfica o el máximo del gabinete.", line)
        ]
    if length > limit:
        return [
            _incompatible(
                f"Línea {n}: la tarjeta gráfica mide {length} mm y el gabinete admite hasta {limit} mm.", line
            )
        ]
    return []


def validate_compatibility(e: ProposalExtraction) -> list[Finding]:
    findings: list[Finding] = []
    for n, line in enumerate(e.lines, start=1):
        for par in _PAIRS:
            findings += _compare_text(n, line, par)
        findings += _compare_gpu(n, line)
    return findings
