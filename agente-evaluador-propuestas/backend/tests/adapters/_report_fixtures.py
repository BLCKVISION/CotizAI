"""Fixtures de `ResultOut` para las pruebas de reportes. Datos ficticios."""

from __future__ import annotations

from datetime import UTC, datetime

from evaluador.domain.evaluation import FindingCode, Origin, Severity, Verdict
from evaluador.domain.result import (
    AmountOut,
    CostOut,
    CostStepOut,
    CriteriaOut,
    CriterionOut,
    EvidenceOut,
    FindingOut,
    LineOut,
    ProposalResultOut,
    ResultOut,
)

MALICIOUS_SUPPLIER = '=HYPERLINK("http://evil.example","clic")'
MALICIOUS_EVIDENCE = "<b>x</b> | @SUM(A1) | línea\ndos"
LONG_EVIDENCE = "Z" * 800


def _criteria(a: int, b: int, c: int) -> CriteriaOut:
    return CriteriaOut(
        performance=CriterionOut(score=a, evidence=["Ryzen 7 con 32 GB (p.1)"]),
        protection_and_peripherals=CriterionOut(score=b, evidence=["UPS de 600 W (p.2)"]),
        warranty_and_support=CriterionOut(score=c, evidence=["Garantía de 3 años en sitio (p.3)"]),
    )


def _line(desc: str, qty: str, price: str, total: str, page: str, quote: str) -> LineOut:
    def amount(v: str) -> AmountOut:
        return AmountOut(literal=v.replace(".", ","), value=v)

    return LineOut(
        description=desc, category="gabinete", quantity=AmountOut(literal=qty, value=qty),
        unit_price=amount(price), line_total=amount(total), evidence=EvidenceOut(page_or_cell=page, text=quote),
    )  # fmt: skip


BETA = ProposalResultOut(
    id="Propuesta_102_Beta_SA", supplier="Beta Soluciones S.A.", verdict=Verdict.VALID, score="86.00", currency="USD",
    criteria=_criteria(86, 84, 88),
    cost=CostOut(total="10450.00", steps=[
        CostStepOut(item="Monto base", amount="10230.00", detail="suma de las líneas"),
        CostStepOut(item="Instalación", amount="220.00", detail="p.2: «Instalación 220,00»"),
    ]),
    lines=[_line("Teclado español ñ áéíóú", "11", "25.00", "275.00", "p.1", "Teclado español ñ — 11 × 25,00")],
)  # fmt: skip

# Cadenas «tal cual»: ni "88.50" ni "10,900.00". El reporte no puede reformatear ni redondear.
ALFA = ProposalResultOut(
    id="Propuesta_101_Alfa_CA", supplier="Alfa Computación C.A.", verdict=Verdict.VALID, score="88.5", currency="USD",
    criteria=_criteria(90, 85, 88),
    cost=CostOut(total="10900", steps=[CostStepOut(item="Monto base", amount="10900", detail="suma de las líneas")]),
    lines=[_line("Monitor 27 pulgadas", "11", "180.00", "1980.00", "p.1", "Monitor IPS — 11 × 180,00")],
)  # fmt: skip

GAMA = ProposalResultOut(
    id="Propuesta_103_Gama_CA", supplier="Gama Tech C.A.", verdict=Verdict.PENDING_REVIEW, score=None, currency="USD",
    cost=CostOut(total=None, steps=[
        CostStepOut(item="Monto base", amount=None, detail="no determinado: hay montos ilegibles en las líneas")
    ]),
    findings=[FindingOut(code=FindingCode.LECTURA, severity=Severity.WARNING, discards=False,
                         reason="Lectura dudosa de la foto.", evidence="foto_cotizacion.jpg", origin=Origin.RULE)],
)  # fmt: skip

DELTA = ProposalResultOut(
    id="Propuesta_104_Delta_CA", supplier="Delta Sistemas C.A.", verdict=Verdict.DISCARDED, score=None,
    currency="USD", cost=CostOut(total="9930.00", steps=[CostStepOut(item="Monto base", amount="9930.00")]),
    findings=[FindingOut(code=FindingCode.ARITMETICA, severity=Severity.CRITICAL, discards=True,
                         reason="Línea 1: 11 × 640.00 = 7040.00, el documento dice 6740.00.",
                         evidence=LONG_EVIDENCE, origin=Origin.RULE)],
)  # fmt: skip

EPSILON = ProposalResultOut(
    id="Propuesta_105_Epsilon_SA", supplier=MALICIOUS_SUPPLIER, verdict=Verdict.DISCARDED, score=None,
    currency="USD", cost=CostOut(total="10230.00", steps=[CostStepOut(item="Monto base", amount="10230.00")]),
    findings=[FindingOut(code=FindingCode.MANIPULACION, severity=Severity.CRITICAL, discards=True,
                         reason="Instrucción a la IA | texto diminuto <i>p.2</i>", evidence=MALICIOUS_EVIDENCE,
                         origin=Origin.RULE)],
    lines=[_line("=cmd|' /C calc'!A0", "1", "-5.00", "-5.00", "p.2", MALICIOUS_EVIDENCE)],
)  # fmt: skip

GENERATED = datetime(2026, 11, 26, 10, 0, tzinfo=UTC)


def make_result(*proposals: ProposalResultOut, ranking: list[str] | None = None) -> ResultOut:
    return ResultOut(
        id="11111111-1111-1111-1111-111111111111", project_id="22222222-2222-2222-2222-222222222222",
        generated=GENERATED, delta="3", ranking=ranking if ranking is not None else [p.id for p in proposals],
        proposals=list(proposals),
    )  # fmt: skip


def full_result() -> ResultOut:
    return make_result(BETA, ALFA, GAMA, DELTA, EPSILON)


def no_valid_result() -> ResultOut:
    return make_result(DELTA, EPSILON)
