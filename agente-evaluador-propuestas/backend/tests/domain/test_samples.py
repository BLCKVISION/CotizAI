"""Las muestras ficticias de `muestras/` deben producir el resultado esperado declarado a mano.

Es una prueba de integración del dominio (reglas + costo + puntaje + ranking). El decisor de abajo solo aplica la
regla de la sección 1 del diseño: un descarte firme descarta; un dato dudoso pide revisión; lo demás es válida.
"""

import json
from decimal import Decimal
from pathlib import Path

import pytest

from evaluador.domain.cost import compute_real_cost
from evaluador.domain.evaluation import Finding, Verdict
from evaluador.domain.extraction import ProposalExtraction
from evaluador.domain.ranking import Candidate, RankingParams, sort_ranking
from evaluador.domain.rules.abusive import validate_abuse
from evaluador.domain.rules.arithmetic import validate_arithmetic
from evaluador.domain.rules.capacity import validate_capacity
from evaluador.domain.rules.compatibility import validate_compatibility
from evaluador.domain.rules.manipulation import detect_manipulation
from evaluador.domain.rules.quality import validate_quality
from evaluador.domain.rules.scope import validate_fixed_scope
from evaluador.domain.score import ScoredRubric, total_score

SAMPLES = Path(__file__).resolve().parents[3] / "muestras"
EXPECTED = json.loads((SAMPLES / "resultado_esperado.json").read_text(encoding="utf-8"))


def _findings(e: ProposalExtraction) -> list[Finding]:
    return [
        *validate_arithmetic(e),
        *validate_fixed_scope(e),
        *validate_compatibility(e),
        *validate_capacity(e),
        *validate_quality(e),
        *validate_abuse(e),
        *detect_manipulation("", e.manipulation_suspicions),
    ]


def _verdict(findings: list[Finding]) -> Verdict:
    if any(h.discards for h in findings):
        return Verdict.DISCARDED
    return Verdict.PENDING_REVIEW if findings else Verdict.VALID


def _load(name: str) -> tuple[ProposalExtraction, ScoredRubric | None]:
    raw = json.loads((SAMPLES / "extracciones" / f"{name}.json").read_text(encoding="utf-8"))
    rubric = ScoredRubric.model_validate(raw["rubric"]) if raw["rubric"] else None
    return ProposalExtraction.model_validate(raw["extraction"]), rubric


@pytest.mark.parametrize("name", sorted(EXPECTED["proposals"]))
def test_each_sample_produces_its_verdict_and_causes(name):
    expected = EXPECTED["proposals"][name]
    extraction, rubric = _load(name)
    findings = _findings(extraction)
    assert _verdict(findings).value == expected["verdict"]
    assert {h.code.value for h in findings} == set(expected["codes"])
    if expected["verdict"] == "valid":
        assert rubric is not None
        assert str(total_score(rubric)) == expected["score"]
        assert compute_real_cost(extraction).total == Decimal(expected["real_cost"])


def test_samples_ranking_matches_the_expected_one():
    candidates = []
    for name in EXPECTED["proposals"]:
        extraction, rubric = _load(name)
        verdict = _verdict(_findings(extraction))
        score = total_score(rubric) if verdict is Verdict.VALID and rubric else None
        candidates.append(Candidate(name, verdict, score, compute_real_cost(extraction).total))
    ranking = sort_ranking(candidates, RankingParams(delta=Decimal(EXPECTED["delta"])))
    assert list(ranking) == EXPECTED["ranking"]


def test_samples_are_fictitious_and_carry_no_real_data():
    text = "".join(p.read_text(encoding="utf-8") for p in (SAMPLES / "extracciones").glob("*.json"))
    assert "@" not in text and "http" not in text  # sin correos ni enlaces reales
