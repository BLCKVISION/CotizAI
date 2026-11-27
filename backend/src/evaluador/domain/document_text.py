"""What a proposal says in plain text: the parts the rules read directly, without trusting the model's labels."""

from __future__ import annotations

import re
import unicodedata

from .extraccion import ExtraccionPropuesta, Linea

_HIDDEN_MARK = "[OCULTO]"
_EXCLUSION = re.compile(
    r"\b(?:no\s+(?:se\s+)?incluyen?|no\s+incluid[oa]s?|sin\s+incluir|(?:does\s+)?not\s+include[ds]?)\b([^.;]*)"
)


def plain(text: str) -> str:
    """Lowercase, without accents, with single spaces."""
    decomposed = unicodedata.normalize("NFKD", text.lower())
    return " ".join("".join(c for c in decomposed if not unicodedata.combining(c)).split())


def visible_text(document: str) -> str:
    """The document without its hidden content: hidden text is evidence of manipulation, never a condition."""
    return document.split(_HIDDEN_MARK, 1)[0]


def exclusions(document: str) -> list[str]:
    """What the proposal says it does not include, one entry per sentence."""
    return [m.group(0).strip() for m in _EXCLUSION.finditer(plain(visible_text(document)))]


def without_exclusions(text: str) -> str:
    return _EXCLUSION.sub(" ", plain(text))


def line_text(line: Linea) -> str:
    specs = " ".join(f"{key} {value}" for key, value in line.especificaciones.items())
    return without_exclusions(f"{line.categoria} {line.descripcion} {specs} {line.evidencia.texto}")


_RECURRING = re.compile(r"(?:/\s*(?:ano|mes|year|month)\b|\banual(?:es)?\b|\bmensual(?:es)?\b|\bpor ano\b)")


def is_recurring(line: Linea) -> bool:
    amounts = " ".join(a.literal for a in (line.precio_unitario, line.total_linea) if a is not None)
    return bool(_RECURRING.search(plain(f"{line.categoria} {line.descripcion} {line.evidencia.texto} {amounts}")))


_SINGLE_CHARGE = re.compile(
    r"\b(?:flete|envio|traslado|shipping|delivery|instalacion|installation|puesta en marcha|servicios?|software|"
    r"licencias?|garantia|soporte|logistica)\b"
)


def is_single_charge(line: Linea) -> bool:
    """A charge quoted without a quantity, such as freight. A product without a quantity is still unreadable."""
    return line.cantidad is None and bool(_SINGLE_CHARGE.search(plain(f"{line.categoria} {line.descripcion}")))


_CHARGE_WORDS = {
    "flete": re.compile(r"\b(?:flete|envio|traslado|shipping|delivery)\b"),
    "instalacion": re.compile(r"\b(?:instalacion|installation|puesta en marcha)\b"),
}


def has_priced_line(e: ExtraccionPropuesta, kind: str) -> bool:
    """True when freight or installation already has its own amount among the lines, so it is not added twice."""
    return any(
        (line.total_linea or line.precio_unitario) is not None
        and _CHARGE_WORDS[kind].search(plain(f"{line.categoria} {line.descripcion}"))
        for line in e.lineas
    )
