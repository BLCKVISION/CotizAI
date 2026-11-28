from types import SimpleNamespace

from evaluador.domain.decision_trace import TraceStep, safe_summary
from evaluador.domain.evaluacion import CodigoHallazgo, Hallazgo, Origen, Severidad


def test_summaries_carry_counts_and_codes_never_document_text():
    leak = "Proveedor ACME RIF J-12345678-9 https://secreto.example/x"
    finding = Hallazgo(CodigoHallazgo.LECTURA, Severidad.ADVERTENCIA, True, leak, leak, Origen.REGLA)
    step = TraceStep("technical", "Reglas", "alert", (leak,))
    out = safe_summary(step, {"hallazgos": [finding]})
    assert "ACME" not in out and "secreto" not in out and "J-1234" not in out
    assert "1 hallazgo(s)" in out and "1 descartan" in out

    extraction = SimpleNamespace(proveedor="ACME", lineas=[1, 2, 3])
    out = safe_summary(TraceStep("extraction", "x", "ok", (leak,)), {"extraccion": extraction})
    assert out == "3 líneas transcritas, cada una con su cita."

    refs = {"enabled": True, "references": [SimpleNamespace(links=("https://secreto.example",))]}
    out = safe_summary(TraceStep("market", "x", "ok", (leak,)), {"consultas": refs})
    assert out == "1 referencias de precio con fuentes citadas."
