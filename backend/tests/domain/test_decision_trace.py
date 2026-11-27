from evaluador.adapters.outbound.agente.motor_langgraph import MotorLangGraph
from evaluador.adapters.outbound.ia.embebedor_falso import EmbebedorFalso
from evaluador.adapters.outbound.memory.indice_vectorial import IndiceEnMemoria
from evaluador.domain.decision_trace import describe_node
from evaluador.domain.evaluacion import Veredicto


class Unreadable:
    def estructurar(self, **_):
        raise ConnectionError


def test_the_trail_only_lists_the_steps_that_ran():
    engine = MotorLangGraph(Unreadable(), EmbebedorFalso(), IndiceEnMemoria())
    result = engine.evaluar(tenant_id="t", propuesta_id="p", requerimiento="r", texto="abc")
    assert result.veredicto is Veredicto.PENDIENTE_DE_REVISION
    assert [s.step for s in result.trace] == ["context", "extraction", "verdict"]


def test_a_disabled_web_search_is_never_shown_as_done():
    market, _ = describe_node("reglas_tecnicas", {"consultas": {"enabled": False}, "hallazgos": []}, 0)
    assert "no se consultó" in market.detail[0]
