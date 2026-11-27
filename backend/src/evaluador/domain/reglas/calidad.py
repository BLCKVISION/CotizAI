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
from evaluador.domain.extraccion import ExtraccionPropuesta, Linea

_INEQUIVOCO = re.compile(
    r"\b(re-?acondicionad\w*|re-?condicionad\w*|refurbish\w*|refurb|remanufacturad\w*|open\s*box|segunda\s*mano|"
    r"second[\s-]?hand|pre[\s-]?owned|seminuev\w*)\b"
)
_AMBIGUO = re.compile(r"\b(usad\w*|used|renovad\w*|reciclad\w*|reutilizad\w*)\b")
# «no/sin/nunca/ni/jamás» antes de la mención y en la misma oración (sin cruzar . ; : ni comas).
_NEGACION = re.compile(r"\b(no|sin|nunca|ni|jamas)\b[^.;:,]*$")
_ANIO_PLAUSIBLE = range(1980, 2101)
# "new" said about the goods, so that "Nuevo Circo" or "nueva propuesta" do not count.
_DECLARED_NEW = re.compile(
    r"\b(?:condicion|estado)\s*:?\s*(?:100\s*%\s*)?nuev[oa]s?\b"
    r"|\b(?:equipos?|productos?|componentes?|hardware)\b[^.;|]{0,30}?\bnuev[oa]s?\b"
    r"|\bnuev[oa]s?\s+(?:de\s+(?:paquete|fabrica|caja)|y\s+sellad\w*)\b"
)
# Only with the maker's wording: a supplier's own product name may look like a model number.
_OLD_PROCESSORS = (
    re.compile(r"\b(?:intel\s+(?:core\s+)?|core\s+)i[3579]\s*(?:-\s*)?[2-7]\d{3}(?!\d)[a-z]{0,2}"),  # 2nd to 7th gen
    re.compile(r"\bxeon\s+e[357]\s*(?:-\s*)?\d{4}l?\s*v[1-4]\b"),
    re.compile(r"\barquitectura\s*(?:de\s*)?(?:200\d|201[0-7])\b"),
)
_OLD_MEMORY = re.compile(r"\bddr\s*(?:-\s*)?([23])(?!\d)")
_NEW_VALUE = re.compile(r"\b(?:nuev[oa]s?|new)\b")


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


def _obsolete_in_text(n: int, line: Linea, p: ParametrosDeCalidad, found: list[Hallazgo]) -> list[Hallazgo]:
    """Old processors or memory written in the line, when the model did not label them."""
    prefix = f"Línea {n}:"
    if any(h.motivo.startswith(prefix) and "obsolet" in h.motivo for h in found):
        return []
    text = esp.sin_acentos(f"{line.descripcion} | {' | '.join(line.especificaciones.values())}").lower()
    old = next((m.group(0) for pattern in _OLD_PROCESSORS if (m := pattern.search(text))), None)
    if old is None and (memory := _OLD_MEMORY.search(text)):
        old = memory.group(0) if f"ddr{memory.group(1)}" in p.tipos_ram_obsoletos else None
    if old is None:
        return []
    return [_hallazgo(f"{prefix} equipo obsoleto ('{esp.recortar(old)}').", line.evidencia.texto or line.descripcion)]


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
    for n, ln in enumerate(e.lineas, start=1):
        hallazgos += _obsolete_in_text(n, ln, p, hallazgos)
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


def declares_new_equipment(e: ExtraccionPropuesta) -> bool:
    """True when the proposal says its goods are new. Silence is not proof that they are."""
    for line in e.lineas:
        for key, value in line.especificaciones.items():
            if esp.normalizar_texto(key) in ("condicion", "estado") and _mencion(_NEW_VALUE, value):
                return True
    texts = [t for line in e.lineas for t in (line.descripcion, line.evidencia.texto)] + e.notas_literales
    for text in texts:
        mention = _mencion(_DECLARED_NEW, text)
        if mention and not re.search(r"\b(?:no|sin)\b", mention):
            return True
    return False
