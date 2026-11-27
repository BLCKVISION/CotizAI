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


_UNFINISHED = re.compile(
    r"(?:,|\b(?:ni|y|o|el|la|los|las|de|del)|\b(?:no\s+(?:se\s+)?incluyen?|no\s+incluid[oa]s?|sin\s+incluir|"
    r"not\s+include[ds]?)\s*:?)$"
)
_BULLET = re.compile(r"^[-*•·]\s*")


def _sentences(text: str) -> list[str]:
    """Lines of the document, joining the ones a sentence or a list of exclusions continues on."""
    joined: list[str] = []
    listing = False  # inside «no incluye:» followed by one item per line
    for raw in text.splitlines():
        current = plain(raw)
        if not current:
            continue
        bullet = bool(_BULLET.match(current))
        if joined and listing and bullet:
            joined[-1] += " " + _BULLET.sub("", current) + ","
            continue
        # A line that starts in lowercase is a wrapped sentence: it still belongs to an open exclusion.
        wrapped = (
            bool(joined) and raw.lstrip()[0].islower() and not joined[-1].endswith((".", ";"))
            and bool(_EXCLUSION.search(joined[-1]))
        )  # fmt: skip
        if joined and not listing and (wrapped or _UNFINISHED.search(joined[-1])):
            joined[-1] += " " + current
        else:
            joined.append(current)
        match = _EXCLUSION.search(joined[-1])
        listing = bool(match) and joined[-1].endswith(":")
    return [sentence.rstrip(",") for sentence in joined]


def exclusions(document: str) -> list[str]:
    """What the proposal says it does not include, one entry per sentence."""
    return [
        m.group(0).strip()
        for sentence in _sentences(visible_text(document))
        for m in _EXCLUSION.finditer(sentence)
    ]


def without_exclusions(text: str) -> str:
    return " ".join(" ".join(_EXCLUSION.sub(" ", sentence) for sentence in _sentences(text)).split())


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
