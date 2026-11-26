"""Las muestras ficticias de `muestras/` deben producir el resultado esperado declarado a mano.

Es una prueba de integración del dominio (reglas + costo + puntaje + ranking). El decisor de abajo solo aplica la
regla de la sección 1 del diseño: un descarte firme descarta; un dato dudoso pide revisión; lo demás es válida.
"""

import json
from decimal import Decimal
from pathlib import Path

import pytest

from evaluador.domain.costo import calcular_costo_real
from evaluador.domain.evaluacion import Hallazgo, Veredicto
from evaluador.domain.extraccion import ExtraccionPropuesta
from evaluador.domain.puntaje import RubricaPuntuada, puntaje_total
from evaluador.domain.ranking import Candidata, ParametrosDeRanking, ordenar_ranking
from evaluador.domain.reglas.abusivo import validar_abuso
from evaluador.domain.reglas.alcance import validar_alcance_fijo
from evaluador.domain.reglas.aritmetica import validar_aritmetica
from evaluador.domain.reglas.calidad import validar_calidad
from evaluador.domain.reglas.capacidad import validar_capacidad
from evaluador.domain.reglas.compatibilidad import validar_compatibilidad
from evaluador.domain.reglas.manipulacion import detectar_manipulacion

MUESTRAS = Path(__file__).resolve().parents[3] / "muestras"
ESPERADO = json.loads((MUESTRAS / "resultado_esperado.json").read_text(encoding="utf-8"))


def _hallazgos(e: ExtraccionPropuesta) -> list[Hallazgo]:
    return [
        *validar_aritmetica(e),
        *validar_alcance_fijo(e),
        *validar_compatibilidad(e),
        *validar_capacidad(e),
        *validar_calidad(e),
        *validar_abuso(e),
        *detectar_manipulacion("", e.sospechas_de_manipulacion),
    ]


def _veredicto(hallazgos: list[Hallazgo]) -> Veredicto:
    if any(h.descarta for h in hallazgos):
        return Veredicto.DESCARTADA
    return Veredicto.PENDIENTE_DE_REVISION if hallazgos else Veredicto.VALIDA


def _cargar(nombre: str) -> tuple[ExtraccionPropuesta, RubricaPuntuada | None]:
    crudo = json.loads((MUESTRAS / "extracciones" / f"{nombre}.json").read_text(encoding="utf-8"))
    rubrica = RubricaPuntuada.model_validate(crudo["rubrica"]) if crudo["rubrica"] else None
    return ExtraccionPropuesta.model_validate(crudo["extraccion"]), rubrica


@pytest.mark.parametrize("nombre", sorted(ESPERADO["propuestas"]))
def test_cada_muestra_produce_su_veredicto_y_sus_causas(nombre):
    esperado = ESPERADO["propuestas"][nombre]
    extraccion, rubrica = _cargar(nombre)
    hallazgos = _hallazgos(extraccion)
    assert _veredicto(hallazgos).value == esperado["veredicto"]
    assert {h.codigo.value for h in hallazgos} == set(esperado["codigos"])
    if esperado["veredicto"] == "valida":
        assert rubrica is not None
        assert str(puntaje_total(rubrica)) == esperado["puntaje"]
        assert calcular_costo_real(extraccion).total == Decimal(esperado["costo_real"])


def test_el_ranking_de_las_muestras_coincide_con_el_esperado():
    candidatas = []
    for nombre in ESPERADO["propuestas"]:
        extraccion, rubrica = _cargar(nombre)
        veredicto = _veredicto(_hallazgos(extraccion))
        puntaje = puntaje_total(rubrica) if veredicto is Veredicto.VALIDA and rubrica else None
        candidatas.append(Candidata(nombre, veredicto, puntaje, calcular_costo_real(extraccion).total))
    ranking = ordenar_ranking(candidatas, ParametrosDeRanking(delta=Decimal(ESPERADO["delta"])))
    assert list(ranking) == ESPERADO["ranking"]


def test_las_muestras_son_ficticias_y_no_traen_datos_reales():
    texto = "".join(p.read_text(encoding="utf-8") for p in (MUESTRAS / "extracciones").glob("*.json"))
    assert "@" not in texto and "http" not in texto  # sin correos ni enlaces reales
