"""Audit trail of one evaluation: what each step of the agent really did and what it concluded.

It is built from the output of every node, not narrated by a model, so it cannot claim a check that did not run.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from .evaluacion import Hallazgo, Veredicto

OK, ALERT, INFO = "ok", "alert", "info"
_MAX_LINES = 8


@dataclass(frozen=True, slots=True)
class TraceStep:
    step: str
    title: str  # shown to people, in Spanish
    status: str  # ok | alert | info
    detail: tuple[str, ...] = ()


def _short(text: str, limit: int = 240) -> str:
    flat = " ".join(text.split())
    return flat if len(flat) <= limit else f"{flat[: limit - 1]}…"


def _findings(step: str, title: str, findings: Sequence[Hallazgo], clean: str) -> TraceStep:
    if not findings:
        return TraceStep(step, title, OK, (clean,))
    lines = tuple(
        _short(f"{'Descarta' if f.descarta else 'Por confirmar'} · {f.codigo.value}: {f.motivo}")
        for f in findings[:_MAX_LINES]
    )
    return TraceStep(step, title, ALERT if any(f.descarta for f in findings) else INFO, lines)


def _market(queries: Mapping[str, Any] | None) -> TraceStep:
    title = "Precios de referencia en la web"
    if not queries or not queries.get("enabled"):
        return TraceStep("market", title, INFO, ("Búsqueda web desactivada en esta instalación: no se consultó.",))
    references = queries.get("references") or ()
    if not references:
        return TraceStep("market", title, INFO, ("Se consultó la web: no hubo precios con fuentes citadas.",))
    lines = tuple(
        _short(f"Línea {number}: referencia {r.moneda} {r.precio_unitario} · {r.fuentes} fuente(s): "
               f"{', '.join(r.links[:2])}", 300)
        for number, r in references[:_MAX_LINES]
    )  # fmt: skip
    return TraceStep("market", title, OK, lines)


def describe_node(node: str, update: Mapping[str, Any], text_length: int) -> list[TraceStep]:
    """Steps that one node of the graph adds to the trail."""
    findings: Sequence[Hallazgo] = update.get("hallazgos") or ()
    if node == "recuperar_contexto":
        count = len(update.get("contexto") or ())
        return [
            TraceStep(
                "context",
                "Lectura del documento",
                OK,
                (f"Texto extraído: {text_length} caracteres. Fragmentos cercanos al requerimiento: {count}.",),
            )
        ]
    if node == "extraer":
        extraction = update.get("extraccion")
        if extraction is None:
            return [_findings("extraction", "La IA transcribe la propuesta", findings, "")]
        lines = [
            f"Proveedor: {extraction.proveedor or 'no consta'} · moneda: {extraction.moneda or 'no consta'}.",
            f"{len(extraction.lineas)} líneas transcritas, cada una con su cita.",
        ]
        return [TraceStep("extraction", "La IA transcribe la propuesta", OK, tuple(_short(x) for x in lines))]
    if node == "manipulacion":
        return [_findings("manipulation", "Instrucciones escondidas", findings,
                          "No se encontraron órdenes dirigidas a la IA.")]  # fmt: skip
    if node == "aritmetica":
        return [_findings("arithmetic", "Cuentas recalculadas en código", findings,
                          "Cantidad × precio y sumas coinciden en las cifras disponibles.")]  # fmt: skip
    if node == "reglas_tecnicas":
        return [
            _market(update.get("consultas")),
            _findings(
                "technical",
                "Compatibilidad, energía, calidad y condiciones",
                findings,
                "Las reglas no encontraron problemas con los datos disponibles.",
            ),  # fmt: skip
        ]
    if node == "alcance":
        return [_findings("scope", "Alcance del proyecto", findings,
                          "Las reglas no encontraron faltantes de alcance.")]  # fmt: skip
    if node == "decidir":
        verdict = update["resultado"].veredicto
        reasons = {
            Veredicto.DESCARTADA: "Descartada: al menos un hallazgo con evidencia descarta.",
            Veredicto.PENDIENTE_DE_REVISION: "Pendiente: algo no se pudo comprobar y debe revisarlo una persona.",
            Veredicto.VALIDA: "Válida: ningún hallazgo la descarta y no quedó lectura pendiente.",
        }
        status = {Veredicto.DESCARTADA: ALERT, Veredicto.VALIDA: OK}.get(verdict, INFO)
        return [TraceStep("verdict", "Veredicto decidido por el código", status, (reasons[verdict],))]
    return []


_FINDING_STEPS = frozenset({"manipulation", "arithmetic", "technical", "scope"})


def safe_summary(step: TraceStep, update: Mapping[str, Any]) -> str:
    """Text for the live trace: only counts and rule codes, never what the documents or the model said.

    `TraceStep.detail` is written for people who may read the results and can carry supplier names, quoted
    evidence and links. The live trace is a second channel, so it gets a summary built from structure alone.
    """
    findings: Sequence[Hallazgo] = update.get("hallazgos") or ()
    if step.step == "extraction":
        extraction = update.get("extraccion")
        return (
            f"{len(extraction.lineas)} líneas transcritas, cada una con su cita."
            if extraction is not None
            else "No se pudo transcribir la propuesta."
        )
    if step.step == "market":
        queries = update.get("consultas") or {}
        if not queries.get("enabled"):
            return "Búsqueda web desactivada: no se consultó."
        return f"{len(queries.get('references') or ())} referencias de precio con fuentes citadas."
    if step.step in _FINDING_STEPS and findings:
        codes = ", ".join(sorted({f.codigo.value for f in findings}))
        return f"{len(findings)} hallazgo(s): {codes}. {sum(1 for f in findings if f.descarta)} descartan."
    return " ".join(step.detail)  # the remaining texts are fixed templates or counts
