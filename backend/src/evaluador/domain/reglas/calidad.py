"""CALIDAD: equipos usados, reacondicionados o reciclados, y obsolescencia declarada.

Descartar mal a un proveedor es lo más costoso en una licitación, así que hay dos niveles de evidencia:

- **Inequívoco** («reacondicionado», «refurbished», «segunda mano»…): descarta, con la frase citada.
- **Ambiguo** («usado», «renovado», «reciclado»…): en el campo `condicion` descarta; en texto libre puede referirse a
  una licencia renovada o a un empaque reciclado, así que solo pide revisión humana.

«Inferior a lo cobrado» exige comparar contra la ficha del fabricante: es un juicio cualitativo del modelo (con cita),
no de esta regla determinista.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from evaluador.domain import especificaciones as esp
from evaluador.domain.evaluacion import CodigoHallazgo, Hallazgo, Origen, Severidad
from evaluador.domain.extraccion import ExtraccionPropuesta

_INEQUIVOCO = re.compile(
    r"\b(re-?acondicionad\w*|re-?condicionad\w*|refurbish\w*|refurb|remanufacturad\w*|open\s*box|segunda\s*mano|"
    r"second[\s-]?hand|pre[\s-]?owned|seminuev\w*)\b"
)
_AMBIGUO = re.compile(r"\b(usad\w*|used|renovad\w*|reciclad\w*|reutilizad\w*)\b")
# «no/sin/nunca/ni/jamás» antes de la mención y en la misma oración (sin cruzar . ; : ni comas).
_NEGACION = re.compile(r"\b(no|sin|nunca|ni|jamas)\b[^.;:,]*$")
_ANIO_PLAUSIBLE = range(1980, 2101)


@dataclass(frozen=True, slots=True)
class ParametrosDeCalidad:
    anio_minimo: int = 2018  # por debajo se considera obsoleto; configurable y registrado en el informe
    tipos_ram_obsoletos: frozenset[str] = frozenset({"ddr2", "ddr3"})


def _hallazgo(motivo: str, cita: str, *, descarta: bool = True) -> Hallazgo:
    codigo = CodigoHallazgo.CALIDAD if descarta else CodigoHallazgo.LECTURA
    severidad = Severidad.CRITICA if descarta else Severidad.ADVERTENCIA
    return Hallazgo(codigo, severidad, descarta, motivo, cita[:200], Origen.REGLA)


def _mencion(patron: re.Pattern[str], texto: str) -> str | None:
    """Primera mención no negada ('no usado', 'nunca ha sido reacondicionado' no cuentan). Texto sin acentos."""
    plano = esp.sin_acentos(texto).lower()
    for m in patron.finditer(plano):
        if not _NEGACION.search(plano[max(0, m.start() - 40) : m.start()]):
            return m.group(0)
    return None


def _condicion_de(textos: tuple[str, ...], *, es_campo_de_condicion: bool = False) -> tuple[str, bool] | None:
    """`(mención, descarta)`: lo inequívoco siempre descarta; lo ambiguo solo si es el campo `condicion`."""
    for texto in textos:
        if mencion := _mencion(_INEQUIVOCO, texto):
            return mencion, True
    for texto in textos:
        if mencion := _mencion(_AMBIGUO, texto):
            return mencion, es_campo_de_condicion
    return None


def validar_calidad(e: ExtraccionPropuesta, p: ParametrosDeCalidad | None = None) -> list[Hallazgo]:
    p = p or ParametrosDeCalidad()
    hallazgos: list[Hallazgo] = []
    for n, ln in enumerate(e.lineas, start=1):
        cita = ln.evidencia.texto or ln.descripcion
        especificaciones = ln.especificaciones
        hallado = _condicion_de((especificaciones.get(esp.CONDICION, ""),), es_campo_de_condicion=True) or (
            _condicion_de((ln.descripcion, ln.modelo or ""))
        )
        if hallado:
            mencion, descarta = hallado
            motivo = f"Línea {n}: equipo no nuevo ('{esp.recortar(mencion)}')."
            if not descarta:
                motivo = f"Línea {n}: menciona '{esp.recortar(mencion)}'; confirme que no indica un equipo no nuevo."
            hallazgos.append(_hallazgo(motivo, cita, descarta=descarta))
        anio_crudo = especificaciones.get(esp.ANIO_LANZAMIENTO)
        if anio_crudo is not None:
            anio = esp.leer_anio(anio_crudo)
            if anio is None or anio not in _ANIO_PLAUSIBLE:
                hallazgos.append(
                    _hallazgo(f"Línea {n}: año de lanzamiento ilegible o ambiguo.", ln.descripcion, descarta=False)
                )
            elif anio < p.anio_minimo:
                hallazgos.append(
                    _hallazgo(f"Línea {n}: obsoleto, lanzado en {anio} (mínimo {p.anio_minimo}).", ln.descripcion)
                )
        ram = especificaciones.get(esp.TIPO_RAM)
        if ram is not None and esp.normalizar_tipo_ram(ram) in p.tipos_ram_obsoletos:
            hallazgos.append(_hallazgo(f"Línea {n}: memoria obsoleta ({esp.recortar(ram)}).", ln.descripcion))
    for nota in e.notas_literales:
        if hallado := _condicion_de((nota,)):
            mencion, descarta = hallado
            texto = (
                "indica equipo no nuevo"
                if descarta
                else "menciona un término ambiguo; confirme que no indica equipo no nuevo"
            )
            hallazgos.append(
                _hallazgo(f"Nota de la propuesta {texto} ('{esp.recortar(mencion)}').", nota, descarta=descarta)
            )
    return hallazgos
