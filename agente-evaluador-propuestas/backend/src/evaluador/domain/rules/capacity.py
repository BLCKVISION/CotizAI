"""CAPACIDAD: fuente de poder y UPS suficientes para el consumo estimado, con margen.

En una UPS no basta con los VA: se exigen los vatios reales. Todo es `Decimal`; los parámetros son configurables
y quedan en el informe (el enunciado no fija el margen).
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_CEILING, Decimal

from evaluador.domain import specs as spec
from evaluador.domain.amounts import read_amount
from evaluador.domain.errors import InvalidData
from evaluador.domain.evaluation import Finding, FindingCode, Origin, Severity
from evaluador.domain.extraction import Line, ProposalExtraction
from evaluador.domain.rules.scope import REQUIRED_DEVICES, normalize_category

_TENTH = Decimal("0.1")


@dataclass(frozen=True, slots=True)
class CapacityParams:
    devices: int = REQUIRED_DEVICES
    margin: Decimal = Decimal("1.25")  # holgura sobre el consumo estimado
    base_consumption_w: Decimal = Decimal(100)  # placa, RAM, almacenamiento y ventiladores
    peripherals_consumption_w: Decimal = Decimal(40)  # monitor conectado a la UPS

    def __post_init__(self) -> None:
        if self.devices < 1 or self.margin < 1 or self.base_consumption_w < 0 or self.peripherals_consumption_w < 0:
            raise InvalidData("Parámetros de capacidad inválidos.")


def _quote(line: Line) -> str:
    return (line.evidence.text or line.description)[:200]


def _review(reason: str, line: Line) -> Finding:
    return Finding(FindingCode.LECTURA, Severity.WARNING, False, reason, _quote(line), Origin.RULE)


def _insufficient(reason: str, line: Line) -> Finding:
    return Finding(FindingCode.CAPACIDAD, Severity.CRITICAL, True, reason, _quote(line), Origin.RULE)


def _device_consumption(line: Line, p: CapacityParams) -> tuple[Decimal | None, str | None]:
    """`(consumo, problema)`. Sin TDP de CPU la línea no es un equipo: `(None, None)`; TDP ilegible: `(None, motivo)`.

    Un TDP ilegible nunca cuenta como 0 W: subestimaría el consumo y dejaría pasar una fuente corta.
    """
    specs = line.specs
    if spec.CPU_TDP_W not in specs:
        return None, None
    cpu = spec.read_measure(specs[spec.CPU_TDP_W], spec.WATTS)
    gpu_raw = specs.get(spec.GPU_TDP_W)
    gpu = Decimal(0) if gpu_raw is None else spec.read_measure(gpu_raw, spec.WATTS)
    if cpu is None or gpu is None:
        return None, "el TDP del procesador o de la tarjeta gráfica es ilegible; no se puede estimar el consumo"
    return cpu + gpu + p.base_consumption_w, None


def _is_ups(line: Line) -> bool:
    # Un «protector» sin potencia (supresor de picos) no es una UPS: solo se valida lo que declara vatios o VA.
    return (
        normalize_category(line.category) == "ups" or spec.UPS_POWER_W in line.specs or spec.UPS_POWER_VA in line.specs
    )


def _validate_source(n: int, line: Line, worst_consumption: Decimal | None, p: CapacityParams) -> list[Finding]:
    watts = spec.read_measure(line.specs.get(spec.PSU_POWER_W), spec.WATTS)
    own_consumption, problem = _device_consumption(line, p)
    if problem:
        return []  # ya se reportó una vez para la línea
    consumption = own_consumption if own_consumption is not None else worst_consumption
    if watts is None:
        return [_review(f"Línea {n}: la potencia de la fuente es ilegible o ambigua.", line)]
    if consumption is None:
        return [_review(f"Línea {n}: sin TDP del procesador no se puede estimar el consumo de la fuente.", line)]
    required = consumption * p.margin
    if watts < required:
        return [_insufficient(
            f"Línea {n}: la fuente de {watts} W no cubre el consumo estimado de {consumption} W con margen de "
            f"{p.margin}× ({required.quantize(_TENTH)} W).", line)]  # fmt: skip
    return []


def _validate_ups(n: int, line: Line, worst_consumption: Decimal | None, p: CapacityParams) -> list[Finding]:
    watts = spec.read_measure(line.specs.get(spec.UPS_POWER_W), spec.WATTS)
    if watts is None:
        if spec.UPS_POWER_W in line.specs:
            reason = "tiene una potencia en vatios ilegible o ambigua"
        elif spec.UPS_POWER_VA in line.specs:
            reason = "solo indica VA y no basta: se exigen los vatios reales"
        else:
            reason = "no indica su potencia"
        return [_review(f"Línea {n}: la UPS {reason}.", line)]
    units = read_amount(line.quantity)
    if units is None or units <= 0 or units != units.to_integral_value():
        return [_review(f"Línea {n}: la cantidad de UPS es ilegible o no es un número entero.", line)]
    if worst_consumption is None:
        return [_review(f"Línea {n}: sin TDP del procesador no se puede estimar la carga de la UPS.", line)]
    devices_by_ups = (Decimal(p.devices) / units).to_integral_value(rounding=ROUND_CEILING)
    required = (worst_consumption + p.peripherals_consumption_w) * devices_by_ups * p.margin
    if watts < required:
        return [_insufficient(
            f"Línea {n}: la UPS de {watts} W no soporta {devices_by_ups} equipo(s) "
            f"(carga estimada con margen: {required.quantize(_TENTH)} W).", line)]  # fmt: skip
    return []


def validate_capacity(e: ProposalExtraction, p: CapacityParams | None = None) -> list[Finding]:
    p = p or CapacityParams()
    consumptions = [_device_consumption(ln, p) for ln in e.lines]
    # Decisión conservadora: el consumo de referencia es el del equipo más exigente de la propuesta. Una fuente
    # o UPS sin equipo propio en su línea se juzga contra él (puede descartar una propuesta que mezcla equipos
    # de distinta potencia; se prefiere eso a aprobar una fuente corta).
    worst_consumption = max((c for c, _ in consumptions if c is not None), default=None)
    findings: list[Finding] = []
    for n, (line, (_, problem)) in enumerate(zip(e.lines, consumptions, strict=True), start=1):
        if problem:
            findings.append(_review(f"Línea {n}: {problem}.", line))
        if spec.PSU_POWER_W in line.specs:
            findings += _validate_source(n, line, worst_consumption, p)
        if _is_ups(line):
            findings += _validate_ups(n, line, worst_consumption, p)
    return findings
