"""Alcance verificable con lista fija: 11 equipos completos. Lo cualitativo lo juzga el modelo con evidencia."""

from __future__ import annotations

import re
import unicodedata
from decimal import Decimal, InvalidOperation

from evaluador.domain.document_text import exclusions, line_text, plain, visible_text, without_exclusions
from evaluador.domain.evaluacion import CodigoHallazgo, Hallazgo, Origen, Severidad
from evaluador.domain.extraccion import ComponentEvidence, ExtraccionPropuesta, Linea
from evaluador.domain.montos import leer_monto

EQUIPOS_REQUERIDOS = 11
CATEGORIAS_REQUERIDAS = ("gabinete", "monitor", "teclado", "raton", "protector")
# Una línea de equipo completo puede incluir los componentes sin detallarlos: no basta para descartar.
_EQUIPO_COMPLETO = ("computadora", "computador", "pc", "equipo", "estacion", "kit")
_SINONIMOS = {"mouse": "raton", "cpu": "gabinete", "torre": "gabinete", "case": "gabinete", "pantalla": "monitor"}


def normalizar_categoria(texto: str) -> str:
    """Minúsculas, sin acentos ni plural simple: 'Ratón', 'ratones' y 'mouse' -> 'raton'."""
    t = "".join(c for c in unicodedata.normalize("NFKD", texto.strip().lower()) if not unicodedata.combining(c))
    for sufijo in ("es", "s"):
        if (
            t.endswith(sufijo)
            and t not in CATEGORIAS_REQUERIDAS
            and t[: -len(sufijo)]
            in {
                *CATEGORIAS_REQUERIDAS,
                *_SINONIMOS,
            }
        ):
            t = t[: -len(sufijo)]
            break
    return _SINONIMOS.get(t, t)


def _cantidad(valor: str) -> Decimal | None:
    try:
        d = Decimal(valor)
    except (InvalidOperation, ValueError):
        return None
    return d if d.is_finite() and d >= 0 and d.adjusted() <= 30 else None


_COMPONENTS = {
    "gabinete": re.compile(r"\b(?:gabinetes?|case|torres?|chasis)\b"),
    "monitor": re.compile(r"\b(?:monitor(?:es|s)?|pantallas?)\b"),
    "teclado": re.compile(r"\b(?:teclados?|keyboards?)\b"),
    "raton": re.compile(r"\b(?:raton(?:es)?|mouse)\b"),
    "protector": re.compile(
        r"\b(?:protector(?:es|s)?|regulador(?:es)?|avr|ups|supresor(?:es)?|proteccion electrica)\b"
    ),
}
_COMPUTER = re.compile(r"\b(?:pcs?|computador(?:as?|es)?|workstations?|estacion(?:es)?)\b")
_STATION = re.compile(r"\b(?:estudiantes?|docentes?)\b")  # who the line is for, which says nothing about what it is
_ACCESSORY = re.compile(
    r"\b(?:escritorios?|mesas?|sillas?|muebles?|cables?|mousepads?|alfombrillas?|audifonos?|auriculares|camaras?|"
    r"webcams?|impresoras?|routers?|switch(?:es)?|licencias?|software|instalacion|flete|envio|garantia|soporte|"
    r"servicios?|capacitacion)\b"
)
_PERIPHERALS = ("monitor", "teclado", "raton", "protector")
_INSTALLATION = re.compile(r"\b(?:instalacion|installation|puesta en marcha)\b")
_EXCLUDED_NAMES = {**_COMPONENTS, "instalación": _INSTALLATION}


def _discard(reason: str, quote: str) -> Hallazgo:
    return Hallazgo(CodigoHallazgo.ALCANCE, Severidad.CRITICA, True, reason, quote[:200], Origen.REGLA)


def _review(reason: str, quote: str) -> Hallazgo:
    return Hallazgo(CodigoHallazgo.LECTURA, Severidad.ADVERTENCIA, False, reason, quote, Origen.REGLA)


def _excluded(document: str) -> list[Hallazgo]:
    """A proposal that says it leaves out something required is incomplete, whatever its lines list."""
    found: list[Hallazgo] = []
    named: set[str] = set()
    for sentence in exclusions(document):
        names = [name for name, pattern in _EXCLUDED_NAMES.items() if pattern.search(sentence) and name not in named]
        if names:
            named.update(names)
            found.append(_discard(f"El presupuesto dice que no incluye: {', '.join(names)}.", sentence))
    return found


def _is_computer(line: Linea) -> bool:
    """What the line sells is what it names first: «PC con monitor» is a computer, «monitor para la PC» is not."""
    text = plain(line.descripcion)
    patterns = [*(_COMPONENTS[name] for name in _PERIPHERALS), _ACCESSORY]
    other = min((m.start() for pattern in patterns if (m := pattern.search(text))), default=None)
    computer = _COMPUTER.search(text)
    if computer is not None:
        return other is None or computer.start() < other
    if other is not None or normalizar_categoria(line.categoria) in _PERIPHERALS:
        return False
    # Only the hardware is described: «Estudiantes Ryzen 5 7600, 16GB» or a line the category calls a computer.
    return bool(_COMPUTER.search(plain(line.categoria)) or _STATION.search(text))


def _is_included_set(line: Linea) -> bool:
    """Several components in one line that charges nothing: a set for each station, however its count was read."""
    total = leer_monto(line.total_linea)
    free = total is None and line.precio_unitario is None or total == 0
    text = line_text(line)
    return free and sum(bool(pattern.search(text)) for pattern in _COMPONENTS.values()) >= 3


def _units(line: Linea) -> Decimal | None:
    units = _cantidad(line.cantidad.valor) if line.cantidad else None
    if units is not None and units <= 1 and _is_included_set(line):
        return None
    return units


def unlisted_components(e: ExtraccionPropuesta) -> list[str]:
    """Required components that no line or note names: quotes often give only a brand and model."""
    texts = [line_text(line) for line in e.lineas] + [without_exclusions(" ".join(e.notas_literales))]
    has_computer = any(_is_computer(line) for line in e.lineas)
    return [
        name for name in CATEGORIAS_REQUERIDAS
        if not (name == "gabinete" and has_computer)
        and not any(_COMPONENTS[name].search(text) for text in texts)
        and not any(normalizar_categoria(line.categoria) == name for line in e.lineas)
    ]  # fmt: skip


def quoted_components(evidence: ComponentEvidence, asked: list[str], document: str) -> set[str]:
    """Only the components whose quote is really in the document: the model cannot invent one."""
    text = without_exclusions(visible_text(document))
    return {
        name
        for item in evidence.found
        if (name := normalizar_categoria(item.component)) in asked
        and len(plain(item.quote)) >= 5
        and plain(item.quote) in text
    }


MIN_COMPONENT_LINES = 5


def _only_the_teacher_set_is_unlisted(e: ExtraccionPropuesta, missing: list[str], equipos: int) -> bool:
    """Every missing component is listed for exactly all stations but one, and that one is a whole computer."""
    teacher = [
        line for line in e.lineas
        if re.search(r"\b(?:pc|computador(?:a)?|equipo|estacion|workstation)\s+(?:del?\s+)?docente\b", line_text(line))
        and _units(line) == 1
    ]  # fmt: skip
    broken_down = sum(1 for line in e.lineas if _units(line) == equipos - 1)
    if not teacher or broken_down < MIN_COMPONENT_LINES:
        return False  # only a student station listed part by part, next to a teacher computer priced whole
    for name in missing:
        listed = sum(
            (units for line in e.lineas
             if (_COMPONENTS[name].search(line_text(line)) or normalizar_categoria(line.categoria) == name)
             and (units := _units(line)) is not None),
            Decimal(0),
        )  # fmt: skip
        if listed != equipos - 1:
            return False
    return True


def validar_alcance_fijo(
    e: ExtraccionPropuesta,
    equipos: int = EQUIPOS_REQUERIDOS,
    document: str = "",
    quoted: frozenset[str] | set[str] = frozenset(),
) -> list[Hallazgo]:
    """Each required component, wherever the proposal mentions it.

    A component listed without its own quantity next to enough complete computers is read as one per station, which
    is how chat quotes are written.
    """
    hallazgos = _excluded(document)
    texts = [(line, line_text(line)) for line in e.lineas]
    notes = without_exclusions(" ".join(e.notas_literales))
    computers = [line for line in e.lineas if _is_computer(line)]
    computer_units = sum((_units(line) or Decimal(0) for line in computers), Decimal(0))
    missing: list[str] = []
    unclear: list[str] = []
    unmentioned: list[str] = []
    for name in CATEGORIAS_REQUERIDAS:
        if name in quoted and computer_units >= equipos:
            continue  # offered, shown with a quote, next to enough complete computers: one per station
        mentioning = [
            line for line, text in texts
            if _COMPONENTS[name].search(text) or normalizar_categoria(line.categoria) == name
            or (name == "gabinete" and _is_computer(line))
        ]  # fmt: skip
        stated = [units for line in mentioning if (units := _units(line)) is not None]
        if sum(stated, Decimal(0)) >= equipos:
            continue
        if len(stated) < len(mentioning):
            if computer_units < equipos:
                unclear.append(name)
        elif mentioning:
            missing.append(name)  # every quantity is readable and they fall short: a note cannot change that
        elif _COMPONENTS[name].search(notes):
            if computer_units < equipos:
                unclear.append(name)
        else:
            unmentioned.append(name)
    if unmentioned and computers:
        hallazgos.append(_review(
            f"Hay equipos completos; verificar si incluyen {equipos} unidades de: {', '.join(unmentioned)}.",
            "línea de equipo completo",
        ))  # fmt: skip
    else:
        missing += unmentioned
    if missing and _only_the_teacher_set_is_unlisted(e, missing, equipos):
        # One whole teacher computer priced on its own: its set may be part of that price. Confirm, never discard.
        hallazgos.append(Hallazgo(
            CodigoHallazgo.ALCANCE, Severidad.ADVERTENCIA, False,
            f"Confirmar que la PC docente incluye: {', '.join(c for c in CATEGORIAS_REQUERIDAS if c in missing)}.",
            "PC docente cotizada como equipo completo", Origen.REGLA,
        ))  # fmt: skip
        missing = []
    if missing:
        ordered = [name for name in CATEGORIAS_REQUERIDAS if name in missing]
        hallazgos.append(_discard(f"No cubre {equipos} unidades de: {', '.join(ordered)}.", "lista fija de requisitos"))
    if unclear:
        hallazgos.append(_review(
            f"Cantidad ilegible; no se puede verificar {equipos} unidades de: {', '.join(unclear)}.",
            "lista fija de requisitos",
        ))  # fmt: skip
    return hallazgos
