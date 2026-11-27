"""Deterministic guardrails of the procurement assistant. Pure code: nothing here depends on a model behaving well."""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from enum import StrEnum

from evaluador.domain.reglas.manipulacion import detectar_manipulacion

MAX_MESSAGE_CHARS = 1500
MAX_SEARCH_QUERY_CHARS = 120


class RefusalCategory(StrEnum):
    OUT_OF_SCOPE = "out_of_scope"
    OTHER_ORGANISATION = "other_organisation"
    MANIPULATION = "manipulation"
    UNSAFE_ANSWER = "unsafe_answer"
    UNVERIFIED_FIGURES = "unverified_figures"


REFUSALS: dict[RefusalCategory, str] = {
    RefusalCategory.OUT_OF_SCOPE: (
        "Solo puedo ayudar con el análisis de presupuestos y propuestas de su organización: consultar evaluaciones, "
        "comparar ofertas, buscar precios de referencia, recomendar los siguientes pasos y generar reportes."
    ),
    RefusalCategory.OTHER_ORGANISATION: (
        "Solo tengo acceso a la información de su organización. No puedo consultar ni comentar datos de otras."
    ),
    RefusalCategory.MANIPULATION: (
        "No puedo cambiar mis reglas ni mostrar mi configuración interna. Puedo ayudarle con los presupuestos de su "
        "organización."
    ),
    RefusalCategory.UNSAFE_ANSWER: "No puedo entregar esa respuesta. Reformule su consulta sobre los presupuestos.",
    RefusalCategory.UNVERIFIED_FIGURES: (
        "No pude respaldar todas las cifras de la respuesta con los datos de su organización, así que no la muestro. "
        "Pida una comparación o un reporte: esas cifras se calculan directamente a partir de los registros."
    ),
}

# Attempts that are unmistakable. Anything subtler is judged by the scope classifier and contained by the tools,
# which can only read the caller's own organisation.
_MANIPULATION_PATTERNS = tuple(
    re.compile(p)
    for p in (
        r"\b(ignora|olvida|omite|descarta|salta(te)?)\b.{0,40}\b(instruccion|instrucciones|reglas|indicaciones)\b",
        r"\b(ignore|disregard|forget)\b.{0,40}\b(instructions|rules)\b",
        r"\b(system\s*prompt|prompt\s+del?\s+sistema|prompt\s+inicial)\b",
        r"\b(muestra|muestrame|revela|repite|imprime|dime|copia|show|reveal|print|repeat)\b.{0,50}"
        r"\b(tus\s+instrucciones|tus\s+reglas|tu\s+prompt|tu\s+configuracion|your\s+(instructions|rules|prompt))\b",
        r"\b(modo\s+(desarrollador|dios|sin\s+restricciones)|developer\s+mode|jailbreak|sin\s+filtros)\b",
        r"\b(api\s*key|clave\s+de\s+(la\s+)?api|variables?\s+de\s+entorno|jwt\s+secret|contrasena\s+(del|de\s+la)\s+"
        r"(base|servidor))\b",
    )
)


def _plain(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text.lower())
    return " ".join("".join(c for c in decomposed if not unicodedata.combining(c)).split())


def screen_user_message(message: str) -> RefusalCategory | None:
    """Rejects obvious manipulation before any model sees it."""
    plain = _plain(message)
    if any(p.search(plain) for p in _MANIPULATION_PATTERNS):
        return RefusalCategory.MANIPULATION
    return None


_SCOPE_LABELS: dict[str, RefusalCategory | None] = {
    "in_scope": None,
    "out_of_scope": RefusalCategory.OUT_OF_SCOPE,
    "other_organisation": RefusalCategory.OTHER_ORGANISATION,
    "manipulation": RefusalCategory.MANIPULATION,
}


def parse_scope_label(reply: str) -> RefusalCategory | None:
    """Reads the classifier's one-word reply. Anything unclear is refused (fail closed)."""
    found = {label for label in _SCOPE_LABELS if re.search(rf"\b{label}\b", reply.lower())}
    return _SCOPE_LABELS[found.pop()] if len(found) == 1 else RefusalCategory.OUT_OF_SCOPE


# ---------- Untrusted data going into the model ----------
_DATA_TAGS = re.compile(r"<\s*(?:/\s*)?(datos|documento|system|sistema|instrucciones)\b[^<>]*>", re.IGNORECASE)
WITHHELD = "[texto retirado: contenía instrucciones dirigidas a la IA]"


def neutralise_delimiters(text: str) -> str:
    """Quoted text cannot close the block that marks it as data."""
    return _DATA_TAGS.sub("[etiqueta retirada]", text)


def neutralise(text: str) -> str:
    """Supplier text reaches the assistant through stored findings: it must not be able to give orders."""
    cleaned = neutralise_delimiters(text)
    if detectar_manipulacion(cleaned, []) or screen_user_message(cleaned):
        return WITHHELD
    return cleaned


def neutralise_tree(value: object) -> object:
    if isinstance(value, str):
        return neutralise(value)
    if isinstance(value, dict):
        return {key: neutralise_tree(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [neutralise_tree(item) for item in value]
    return value


# ---------- Data leaving the platform ----------
_EMAIL = re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b")
_TAX_ID = re.compile(r"\b[JGVEP]-?\d{7,9}-?\d?\b", re.IGNORECASE)
_PHONE = re.compile(r"\+?\d[\d\s().-]{8,}\d")
_URL = re.compile(r"(?:https?://|www\.)[^\s<>\")\]]+", re.IGNORECASE)


def sanitise_search_query(query: str, private_terms: Iterable[str] = ()) -> str:
    """Only a product description may reach the web: no organisation, project or supplier names, no identifiers."""
    cleaned = " ".join(query.split())
    for pattern in (_URL, _EMAIL, _TAX_ID, _PHONE):
        cleaned = pattern.sub(" ", cleaned)
    for term in sorted({t.strip() for t in private_terms if len(t.strip()) >= 4}, key=len, reverse=True):
        cleaned = re.sub(re.escape(term), " ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"[<>{}]", " ", cleaned)
    return " ".join(cleaned.split())[:MAX_SEARCH_QUERY_CHARS]


# ---------- The answer ----------
_SECRETS = re.compile(
    r"sk-[A-Za-z0-9_-]{16,}|\bBearer\s+[A-Za-z0-9._-]{16,}|\bpostgres(?:ql)?://\S+|\beyJ[A-Za-z0-9_-]{20,}\.[\w-]+"
)
_CLAIMED_ACTION = re.compile(
    r"\b(he|ya|acabo de)\s+(adjudicad[oa]|adjudicar|aprobad[oa]|aprobar|eliminad[oa]|eliminar|borrad[oa]|borrar|"
    r"cerrad[oa]|cerrar|modificad[oa]|modificar|enviad[oa]|enviar|comprad[oa]|comprar|pagad[oa]|pagar)\b"
)
_LEAK_WINDOW = 60
_UUID = re.compile(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b", re.IGNORECASE)
_NUMBER = re.compile(r"(?<![\w.,])\d+(?:[.,]\d+)*(?![\w])")
_CURRENCY_BEFORE = re.compile(r"(?:\$|usd|us\$|bs\.?|ves|eur|€)\s*$", re.IGNORECASE)
_CURRENCY_AFTER = re.compile(r"^\s*(?:\$|%|usd\b|ves\b|eur\b|€|bs\b|d[oó]lares\b|bol[ií]vares\b)", re.IGNORECASE)
_YEARS = range(1990, 2101)


def _readings(token: str) -> set[Decimal]:
    """Every value a written number may stand for: '1.250' can be 1250 (Spanish) or 1.25."""
    candidates: set[str] = set()
    separators = [c for c in token if c in ".,"]
    if not separators:
        candidates.add(token)
    elif len(set(separators)) == 2:  # the last one marks decimals
        decimal_mark = separators[-1]
        thousands = "," if decimal_mark == "." else "."
        candidates.add(token.replace(thousands, "").replace(decimal_mark, "."))
    else:
        mark = separators[0]
        groups = token.split(mark)
        if all(len(g) == 3 for g in groups[1:]):
            candidates.add("".join(groups))
        if len(groups) == 2:
            candidates.add(".".join(groups))
    values: set[Decimal] = set()
    for candidate in candidates:
        try:
            values.add(Decimal(candidate))
        except InvalidOperation:
            continue
    return values


def _numbers(text: str) -> set[Decimal]:
    return {v for m in _NUMBER.finditer(_UUID.sub(" ", text)) for v in _readings(m.group(0))}


def _is_supported(value: Decimal, known: set[Decimal]) -> bool:
    """Equal, or a rounding of a known figure to the precision the answer shows."""
    if value in known:
        return True
    exponent = value.as_tuple().exponent
    if not isinstance(exponent, int):
        return False
    step = Decimal(1).scaleb(min(exponent, 0))
    return any(abs(abs(k) - value) <= step / 2 for k in known if abs(k) < Decimal("1e15"))


def unsupported_figures(answer: str, evidence: str) -> tuple[str, ...]:
    """Amounts and percentages in the answer that appear nowhere in the evidence."""
    known = _numbers(evidence)
    text = _UUID.sub(" ", _URL.sub(" ", answer)).replace("*", "")
    missing: list[str] = []
    for match in _NUMBER.finditer(text):
        token = match.group(0)
        values = _readings(token)
        has_unit = bool(
            _CURRENCY_BEFORE.search(text[max(0, match.start() - 6) : match.start()])
            or _CURRENCY_AFTER.match(text[match.end() : match.end() + 12])
        )
        large = any(v >= 1000 and not (v == v.to_integral_value() and int(v) in _YEARS) for v in values)
        if (has_unit or large) and not any(_is_supported(v, known) for v in values):
            missing.append(token)
    return tuple(dict.fromkeys(missing))


def leaks_instructions(answer: str, system_prompt: str, canary: str) -> bool:
    if canary.lower() in answer.lower():
        return True
    secret, reply = _plain(system_prompt), _plain(answer)
    if len(reply) < _LEAK_WINDOW:
        return False
    return any(reply[i : i + _LEAK_WINDOW] in secret for i in range(0, len(reply) - _LEAK_WINDOW + 1, 5))


@dataclass(frozen=True, slots=True)
class AnswerCheck:
    text: str  # the answer with links that no tool returned removed
    blocked: RefusalCategory | None = None
    correction: str | None = None  # what to tell the model for its one retry
    removed_links: int = 0


def check_answer(
    answer: str, *, system_prompt: str, canary: str, evidence: str, allowed_links: Iterable[str]
) -> AnswerCheck:
    text = answer.strip()
    if not text:
        return AnswerCheck(text, RefusalCategory.UNSAFE_ANSWER, "La respuesta quedó vacía. Responde de nuevo.")
    if _SECRETS.search(text) or leaks_instructions(text, system_prompt, canary):
        return AnswerCheck("", RefusalCategory.UNSAFE_ANSWER)  # never retried
    if _CLAIMED_ACTION.search(_plain(text)):
        return AnswerCheck(
            text,
            RefusalCategory.UNSAFE_ANSWER,
            "Afirmaste haber ejecutado una acción. Solo consultas y generas reportes. Corrige la respuesta.",
        )
    allowed = {link.rstrip("/.") for link in allowed_links}
    removed = 0

    def keep(match: re.Match[str]) -> str:
        nonlocal removed
        link = match.group(0)
        if link.rstrip("/.,;:") in allowed:
            return link
        removed += 1
        return "[enlace retirado]"

    text = _URL.sub(keep, text)
    if missing := unsupported_figures(text, evidence):
        return AnswerCheck(
            text,
            RefusalCategory.UNVERIFIED_FIGURES,
            f"Estas cifras no aparecen en los datos de las herramientas: {', '.join(missing[:8])}. No calcules ni "
            "estimes: usa solo cifras devueltas por las herramientas (la comparación ya trae las diferencias) o "
            "responde sin esas cifras.",
            removed,
        )
    return AnswerCheck(text, removed_links=removed)
