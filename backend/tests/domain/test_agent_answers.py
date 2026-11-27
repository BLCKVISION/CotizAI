"""Regressions found by using the platform with the real model."""

from __future__ import annotations

from decimal import Decimal

import pytest
from pydantic import BaseModel, Field

from evaluador.adapters.outbound.ia._comun import validate_reply
from evaluador.domain.costo import calcular_costo_real
from evaluador.domain.extraccion import Condiciones, ExtraccionPropuesta, Linea, Monto
from evaluador.domain.normalisation import normalise
from evaluador.domain.puntaje import PuntajeCriterio, RubricaPuntuada, limit_unsupported_score


class Reply(BaseModel):
    answer: str
    sources: list[int] = Field(default_factory=list)


@pytest.mark.parametrize(
    "text",
    [
        '{"answer": "Andina", "sources": [1]}',
        '{"properties": {"answer": "Andina", "sources": [1]}, "required": ["answer"], "type": "object"}',
        '{"properties": {"answer": {"type": "string"}}, "type": "object", "answer": "Andina", "sources": [1]}',
        '{"answer": "Andina", "sources": [1]}, "sobrante"}',
    ],
)
def test_the_shapes_the_real_model_replies_with_are_read(text):
    assert validate_reply(text, Reply) == Reply(answer="Andina", sources=[1])


def test_an_echoed_schema_without_an_answer_is_still_an_error():
    with pytest.raises(ValueError):
        validate_reply('{"properties": {"answer": {"type": "string"}}, "type": "object"}', Reply)


def _extraction(**conditions) -> ExtraccionPropuesta:
    one = Monto(literal="100", valor="100")
    line = Linea(descripcion="PC", categoria="equipo", cantidad=Monto(literal="1", valor="1"), total_linea=one)
    return ExtraccionPropuesta(moneda="USD", lineas=[line], condiciones=Condiciones(**conditions))


def _rubric(score: int) -> RubricaPuntuada:
    part = PuntajeCriterio(puntaje=score, evidencia=["cita"])
    return RubricaPuntuada(rendimiento=part, proteccion_y_perifericos=part, garantia_y_soporte=part)


def test_a_warranty_alone_does_not_score_as_support():
    assert limit_unsupported_score(_rubric(90), _extraction(garantia="24 meses")).garantia_y_soporte.puntaje == 40


@pytest.mark.parametrize(
    "text",
    ["24 meses (Soporte presencial 24h)", "12 months with on-site support", "60 meses (Dell ProSupport Plus NBD)"],
)
def test_stated_support_keeps_its_score(text):
    assert limit_unsupported_score(_rubric(90), _extraction(garantia=text)).garantia_y_soporte.puntaje == 90


@pytest.mark.parametrize(
    ("literal", "known"),
    [("Free shipping", True), ("Gratis", True), ("a convenir", False), ("gratis desde cierto monto", False)],
)
def test_free_shipping_in_words_costs_zero(literal, known):
    cost = calcular_costo_real(_extraction(flete=Monto(literal=literal, valor="")))
    assert (cost.total == Decimal(100)) is known


def test_one_unit_with_only_its_total_is_readable():
    total = Monto(literal="$1,100.00", valor="1100.00")
    line = Linea(descripcion="Servicios opcionales", categoria="servicio", cantidad=Monto(literal="1", valor="1"),
                 total_linea=total)  # fmt: skip
    [read] = normalise(ExtraccionPropuesta(lineas=[line]), "Servicios opcionales 1 $1,100.00").lineas
    assert read.precio_unitario == total
