"""Contenido común de los reportes: qué se muestra y en qué orden. Cada formato solo lo dibuja.

Regla de oro: las cifras (puntajes, montos, totales) se muestran con la MISMA cadena del `ResultOut`. Aquí no se
parsea a float ni se redondea; lo indeterminado dice «No determinado», nunca 0.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation

from evaluador.application.use_cases.export_report import ReportInput
from evaluador.domain.evaluation import Verdict
from evaluador.domain.result import FindingOut, LineOut, ProposalResultOut

NOT_DETERMINED = "No determinado"
NO_VALID = "Ninguna propuesta válida"
EVIDENCE_LIMIT = 500

VERDICT_LABEL = {
    Verdict.VALID: "Válida",
    Verdict.DISCARDED: "Descartada",
    Verdict.PENDING_REVIEW: "Pendiente de revisión",
}
CAUSE_LABEL = {
    "ALCANCE": "No cubre el alcance",
    "COMPAT": "Componentes incompatibles",
    "CAPACIDAD": "Fuente o UPS insuficiente",
    "CALIDAD": "Calidad inferior a lo cobrado",
    "ABUSIVO": "Condiciones abusivas",
    "ARITMETICA": "Cifras que no coinciden",
    "MANIPULACION": "Instrucciones ocultas dirigidas a la IA",
    "LECTURA": "Lectura dudosa",
}
ORIGIN_LABEL = {"rule": "regla", "ai": "IA", "person": "persona"}
CRITERIA = (
    ("performance", "Rendimiento"),
    ("protection_and_peripherals", "Protección y periféricos"),
    ("warranty_and_support", "Garantía y soporte"),
)

_PLAIN_DECIMAL = re.compile(r"^-?\d{1,14}(\.\d{1,8})?$")
_SPACES = re.compile(r"\s+")


def is_plain_decimal(text: str | None) -> bool:
    """Cadena numérica simple (sin fórmulas posibles): se puede escribir tal cual en una celda."""
    return text is not None and _PLAIN_DECIMAL.match(text) is not None


def one_line(text: str | None) -> str:
    return _SPACES.sub(" ", text or "").strip()


def clip(text: str | None, limit: int = EVIDENCE_LIMIT) -> str:
    t = one_line(text)
    return t if len(t) <= limit else t[:limit] + "…"


def cause_label(code: str) -> str:
    return CAUSE_LABEL.get(code, code)


@dataclass(frozen=True, slots=True)
class Ranked:
    position: int | None  # None = descartada (no entra al ranking)
    proposal: ProposalResultOut


@dataclass(frozen=True, slots=True)
class ReportModel:
    project_name: str
    generated: str
    delta: str
    ranked: list[Ranked]  # válidas y pendientes en el orden del ranking, luego descartadas
    recommended: ProposalResultOut | None
    motive: str
    notes: tuple[str, ...]

    @property
    def classified(self) -> list[Ranked]:
        return [r for r in self.ranked if r.position is not None]

    @property
    def discarded(self) -> list[ProposalResultOut]:
        return [r.proposal for r in self.ranked if r.position is None]


def discarding(p: ProposalResultOut) -> list[FindingOut]:
    return [f for f in p.findings if f.discards]


def warnings(p: ProposalResultOut) -> list[FindingOut]:
    return [f for f in p.findings if not f.discards]


def money(value: str | None) -> str:
    return NOT_DETERMINED if value is None else value


def amount_literal(line: LineOut, attr: str) -> str:
    value = getattr(line, attr)
    return value.literal if value else "No consta"


def build_model(data: ReportInput) -> ReportModel:
    result = data.result
    by_id = {p.id: p for p in result.proposals}
    seen: set[str] = set()
    ordered: list[ProposalResultOut] = []
    for pid in [*result.ranking, *(p.id for p in result.proposals)]:  # sin perder ni repetir propuestas
        if pid in by_id and pid not in seen:
            seen.add(pid)
            ordered.append(by_id[pid])
    non_discarded = [p for p in ordered if p.verdict is not Verdict.DISCARDED]
    ranked = [Ranked(i, p) for i, p in enumerate(non_discarded, start=1)]
    ranked += [Ranked(None, p) for p in ordered if p.verdict is Verdict.DISCARDED]
    recommended = next((p for p in non_discarded if p.verdict is Verdict.VALID), None)
    return ReportModel(
        project_name=one_line(data.project_name),
        generated=result.generated.date().isoformat(),
        delta=result.delta,
        ranked=ranked,
        recommended=recommended,
        motive=_motive(recommended, non_discarded, result.delta),
        notes=tuple(one_line(n) for n in data.notes if one_line(n)),
    )


def _as_decimal(text: str | None) -> Decimal:
    try:
        return Decimal(text or "0")
    except InvalidOperation:
        return Decimal(0)


def _motive(rec: ProposalResultOut | None, non_discarded: list[ProposalResultOut], delta: str) -> str:
    if rec is None:
        return "Ninguna propuesta es válida: el comité debe revisar las pendientes o reabrir la convocatoria."
    valid = [p for p in non_discarded if p.verdict is Verdict.VALID and p.score is not None]
    # Comparación solo para elegir la frase; las cifras citadas son las cadenas originales.
    best = max(valid, key=lambda p: _as_decimal(p.score), default=rec)
    if best.id == rec.id:
        return "Mayor puntaje técnico entre las propuestas válidas."
    return (
        f"Equivalencia técnica: su puntaje ({rec.score}) está dentro del margen de {delta} puntos respecto a "
        f"«{one_line(best.supplier) or best.id}» ({best.score}); a igual nivel técnico gana el menor costo real."
    )
