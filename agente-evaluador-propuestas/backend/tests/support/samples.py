"""Puente entre el generador de muestras (muestras/generate.py) y los tests: modelo falso programado por muestra."""

from __future__ import annotations

import hashlib
import importlib.util
import sys
from pathlib import Path
from types import ModuleType

from evaluador.adapters.outbound.ai.fake_model import FakeModel
from evaluador.domain.extraction import (
    Amount,
    Conditions,
    Evidence,
    ImageTranscription,
    Line,
    ProposalExtraction,
    ScopeJudgment,
    Totals,
)
from evaluador.domain.score import CriterionScore, ScoredRubric

_GENERATOR = Path(__file__).resolve().parents[3] / "muestras" / "generate.py"


def load_generator() -> ModuleType:
    name = "samples_generator"
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, _GENERATOR)
    assert spec and spec.loader, f"no se encontró {_GENERATOR}"
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module  # los dataclasses necesitan el módulo registrado al ejecutarse
    spec.loader.exec_module(module)
    return module


def _amount(gen: ModuleType, value) -> Amount:
    return Amount(literal=gen.es(value), value=f"{value:.2f}")


def extraction_for(gen: ModuleType, s) -> ProposalExtraction:
    """Lo que un modelo que transcribe bien devolvería para esta muestra (cifras tal cual, null si no consta)."""
    lines = []
    for i, ln in enumerate(s.lines, start=1):
        evidence_text = f"{ln.description} - {ln.qty} x {gen.es(ln.unit)} = {gen.es(ln.total)}"
        lines.append(
            Line(
                description=ln.description,
                category=ln.category,
                specs=dict(ln.specs),
                quantity=Amount(literal=str(ln.qty), value=str(ln.qty)),
                unit_price=_amount(gen, ln.unit),
                line_total=_amount(gen, ln.total),
                evidence=Evidence(page_or_cell=f"fila {i}", text=evidence_text),
            )
        )
    return ProposalExtraction(
        supplier=s.supplier,
        currency="USD",
        lines=lines,
        totals=Totals(subtotal=_amount(gen, s.subtotal), total=_amount(gen, s.subtotal)),
        conditions=Conditions(
            freight=_amount(gen, s.freight) if s.freight is not None else None,
            installation=_amount(gen, s.installation) if s.installation is not None else None,
            warranty=s.warranty,
            support=s.support,
        ),
        # Vacío a propósito: la manipulación se detecta por patrón sobre el texto leído, no porque el modelo avise.
        manipulation_suspicions=[],
    )


def rubric_for(gen: ModuleType, stem: str) -> ScoredRubric:
    s = next(x for x in gen.SAMPLES if x.stem == stem)
    assert s.rubric is not None, f"{stem} no tiene rúbrica (no es válida)"
    perf, prot, warr = s.rubric
    cite = f"Evidencia de {s.supplier} (cotización)"
    return ScoredRubric(
        performance=CriterionScore(score=perf, evidence=[cite]),
        protection_and_peripherals=CriterionScore(score=prot, evidence=[cite]),
        warranty_and_support=CriterionScore(score=warr, evidence=[cite]),
    )


def _sample_in(gen: ModuleType, text: str):
    for s in gen.SAMPLES:
        if s.marker in text:
            return s
    raise ValueError("Texto sin proveedor reconocible")


def scripted_model(gen: ModuleType, folder: Path) -> FakeModel:
    """Modelo falso: extracción y rúbrica según el proveedor que figure en el texto leído; visión según el hash del
    archivo (una foto legible devuelve su transcripción; la borrosa se marca ilegible)."""
    from evaluador.adapters.outbound.extraction.preprocess import enhance

    by_hash = {}
    for s in gen.SAMPLES:
        if s.fmt == "png":
            raw = (folder / s.file).read_bytes()
            # El motor lee primero la imagen mejorada y, si duda, la original: ambas deben resolver a la muestra.
            for variant in (raw, enhance(raw)):
                by_hash[hashlib.sha256(variant).hexdigest()] = s

    def vision(latin1: str) -> ImageTranscription:
        s = by_hash[hashlib.sha256(latin1.encode("latin-1")).hexdigest()]
        return (
            ImageTranscription(text="", unreadable=True) if s.blurry else ImageTranscription(text=gen.transcription(s))
        )

    return FakeModel(
        {
            ProposalExtraction: lambda text: extraction_for(gen, _sample_in(gen, text)),
            ScopeJudgment: ScopeJudgment(meets=True),
            ScoredRubric: lambda text: rubric_for(gen, _sample_in(gen, text).stem),
            ImageTranscription: vision,
        }
    )
