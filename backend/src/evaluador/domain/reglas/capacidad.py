"""CAPACIDAD: fuente de poder y UPS suficientes para el consumo estimado, con margen.

En una UPS no basta con los VA: se exigen los vatios reales. Todo es `Decimal`; los parámetros son configurables
y quedan en el informe (el enunciado no fija el margen).
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_CEILING, Decimal

from evaluador.domain import especificaciones as esp
from evaluador.domain.errores import DatoInvalido
from evaluador.domain.evaluacion import CodigoHallazgo, Hallazgo, Origen, Severidad
from evaluador.domain.extraccion import ExtraccionPropuesta, Linea
from evaluador.domain.montos import leer_monto
from evaluador.domain.reglas.alcance import EQUIPOS_REQUERIDOS, normalizar_categoria

_DECIMO = Decimal("0.1")


@dataclass(frozen=True, slots=True)
class ParametrosDeCapacidad:
    equipos: int = EQUIPOS_REQUERIDOS
    margen: Decimal = Decimal("1.25")  # holgura sobre el consumo estimado
    consumo_base_w: Decimal = Decimal(100)  # placa, RAM, almacenamiento y ventiladores
    consumo_perifericos_w: Decimal = Decimal(40)  # monitor conectado a la UPS

    def __post_init__(self) -> None:
        if self.equipos < 1 or self.margen < 1 or self.consumo_base_w < 0 or self.consumo_perifericos_w < 0:
            raise DatoInvalido("Parámetros de capacidad inválidos.")


def _cita(linea: Linea) -> str:
    return (linea.evidencia.texto or linea.descripcion)[:200]


def _revisar(motivo: str, linea: Linea) -> Hallazgo:
    return Hallazgo(CodigoHallazgo.LECTURA, Severidad.ADVERTENCIA, False, motivo, _cita(linea), Origen.REGLA)


def _insuficiente(motivo: str, linea: Linea) -> Hallazgo:
    return Hallazgo(CodigoHallazgo.CAPACIDAD, Severidad.CRITICA, True, motivo, _cita(linea), Origen.REGLA)


def _consumo_del_equipo(linea: Linea, p: ParametrosDeCapacidad) -> tuple[Decimal | None, str | None]:
    """`(consumo, problema)`. Sin TDP de CPU la línea no es un equipo: `(None, None)`; TDP ilegible: `(None, motivo)`.

    Un TDP ilegible nunca cuenta como 0 W: subestimaría el consumo y dejaría pasar una fuente corta.
    """
    especificaciones = linea.especificaciones
    if esp.CPU_TDP_W not in especificaciones:
        return None, None
    cpu = esp.leer_medida(especificaciones[esp.CPU_TDP_W], esp.VATIOS)
    gpu_crudo = especificaciones.get(esp.GPU_TDP_W)
    gpu = Decimal(0) if gpu_crudo is None else esp.leer_medida(gpu_crudo, esp.VATIOS)
    if cpu is None or gpu is None:
        return None, "el TDP del procesador o de la tarjeta gráfica es ilegible; no se puede estimar el consumo"
    return cpu + gpu + p.consumo_base_w, None


def _es_ups(linea: Linea) -> bool:
    # Un «protector» sin potencia (supresor de picos) no es una UPS: solo se valida lo que declara vatios o VA.
    return (
        normalizar_categoria(linea.categoria) == "ups"
        or esp.POTENCIA_UPS_W in linea.especificaciones
        or esp.POTENCIA_UPS_VA in linea.especificaciones
    )


def _validar_fuente(n: int, linea: Linea, peor_consumo: Decimal | None, p: ParametrosDeCapacidad) -> list[Hallazgo]:
    vatios = esp.leer_medida(linea.especificaciones.get(esp.POTENCIA_FUENTE_W), esp.VATIOS)
    consumo_propio, problema = _consumo_del_equipo(linea, p)
    if problema:
        return []  # ya se reportó una vez para la línea
    consumo = consumo_propio if consumo_propio is not None else peor_consumo
    if consumo is None:
        return []  # nothing to compare with: the power question stays "not verified"
    if vatios is None:
        return [_revisar(f"Línea {n}: la potencia de la fuente es ilegible o ambigua.", linea)]
    requerido = consumo * p.margen
    if vatios < requerido:
        return [_insuficiente(
            f"Línea {n}: la fuente de {vatios} W no cubre el consumo estimado de {consumo} W con margen de "
            f"{p.margen}× ({requerido.quantize(_DECIMO)} W).", linea)]  # fmt: skip
    return []


def _validar_ups(n: int, linea: Linea, peor_consumo: Decimal | None, p: ParametrosDeCapacidad) -> list[Hallazgo]:
    if peor_consumo is None:
        return []  # nothing to compare with: the power question stays "not verified"
    vatios = esp.leer_medida(linea.especificaciones.get(esp.POTENCIA_UPS_W), esp.VATIOS)
    if vatios is None:
        if esp.POTENCIA_UPS_W in linea.especificaciones:
            motivo = "tiene una potencia en vatios ilegible o ambigua"
        elif esp.POTENCIA_UPS_VA in linea.especificaciones:
            motivo = "solo indica VA y no basta: se exigen los vatios reales"
        else:
            motivo = "no indica su potencia"
        return [_revisar(f"Línea {n}: la UPS {motivo}.", linea)]
    unidades = leer_monto(linea.cantidad)
    if unidades is None or unidades <= 0 or unidades != unidades.to_integral_value():
        return [_revisar(f"Línea {n}: la cantidad de UPS es ilegible o no es un número entero.", linea)]
    equipos_por_ups = (Decimal(p.equipos) / unidades).to_integral_value(rounding=ROUND_CEILING)
    requerido = (peor_consumo + p.consumo_perifericos_w) * equipos_por_ups * p.margen
    if vatios < requerido:
        return [_insuficiente(
            f"Línea {n}: la UPS de {vatios} W no soporta {equipos_por_ups} equipo(s) "
            f"(carga estimada con margen: {requerido.quantize(_DECIMO)} W).", linea)]  # fmt: skip
    return []


def validar_capacidad(e: ExtraccionPropuesta, p: ParametrosDeCapacidad | None = None) -> list[Hallazgo]:
    p = p or ParametrosDeCapacidad()
    consumos = [_consumo_del_equipo(ln, p) for ln in e.lineas]
    # Decisión conservadora: el consumo de referencia es el del equipo más exigente de la propuesta. Una fuente
    # o UPS sin equipo propio en su línea se juzga contra él (puede descartar una propuesta que mezcla equipos
    # de distinta potencia; se prefiere eso a aprobar una fuente corta).
    peor_consumo = max((c for c, _ in consumos if c is not None), default=None)
    hallazgos: list[Hallazgo] = []
    for n, (linea, (_, problema)) in enumerate(zip(e.lineas, consumos, strict=True), start=1):
        if problema:
            hallazgos.append(_revisar(f"Línea {n}: {problema}.", linea))
        if esp.POTENCIA_FUENTE_W in linea.especificaciones:
            hallazgos += _validar_fuente(n, linea, peor_consumo, p)
        if _es_ups(linea):
            hallazgos += _validar_ups(n, linea, peor_consumo, p)
    return hallazgos


def capacity_was_compared(e: ExtraccionPropuesta, p: ParametrosDeCapacidad | None = None) -> bool:
    """True only when some power supply or UPS was really weighed against an estimated consumption.

    Finding no problem because there was nothing to compare must never be reported as "the power is enough".
    """
    p = p or ParametrosDeCapacidad()
    consumptions = [_consumo_del_equipo(line, p)[0] for line in e.lineas]
    if all(c is None for c in consumptions):
        return False
    for line in e.lineas:
        if esp.leer_medida(line.especificaciones.get(esp.POTENCIA_FUENTE_W), esp.VATIOS) is not None:
            return True
        units = leer_monto(line.cantidad)
        if (
            _es_ups(line)
            and esp.leer_medida(line.especificaciones.get(esp.POTENCIA_UPS_W), esp.VATIOS) is not None
            and units is not None
            and units > 0
        ):
            return True
    return False
