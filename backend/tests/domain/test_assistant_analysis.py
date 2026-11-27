from decimal import Decimal

from evals.assistant.fixtures import LAB, OWN_TENANT, seed

from evaluador.composition.contenedor import construir_contenedor
from evaluador.domain.assistant.analysis import compare


def test_a_discarded_offer_never_sets_the_reference():
    container = construir_contenedor()
    user = seed(container, "x")["norte-coordinador"]
    project = container.obtener_proyecto.ejecutar(user, LAB)
    evaluation = container.get_project_evaluation.execute(user, LAB)
    assert user.tenant_id == OWN_TENANT
    rows = {r.supplier: r for r in compare([(project, i) for i in evaluation.items]).rows}
    assert rows["Andina Tech"].difference_vs_cheapest == 0  # cheapest valid one
    assert rows["Boreal Sistemas"].difference_vs_cheapest == Decimal(850)
    assert rows["Proveedor Trampa"].difference_vs_cheapest == Decimal(-2260)
