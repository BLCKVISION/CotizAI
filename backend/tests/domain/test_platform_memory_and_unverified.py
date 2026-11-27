"""DDR generation fixed by the processor platform, and honest "not verified" answers."""

from __future__ import annotations

import pytest

from evaluador.domain.extraccion import ExtraccionPropuesta, Linea, Monto
from evaluador.domain.reglas.compatibilidad import validar_compatibilidad
from evaluador.domain.verification import unverified_checks


def _quote(specs: dict[str, str] | None = None, evidence: str = "", notes: list[str] | None = None, **line):
    item = Linea(descripcion="Estación", categoria="equipo", especificaciones=specs or {},
                 evidencia={"texto": evidence}, **line)  # fmt: skip
    return ExtraccionPropuesta(lineas=[item], notas_literales=notes or [])


AM5 = "AMD Ryzen 5 7600 (Socket AM5, 6C/12T)"


@pytest.mark.parametrize(
    "extraction",
    [
        _quote({"CPU": AM5, "RAM": "32GB (DDR4 3200MHz (2x16GB))"}),
        _quote(evidence=f"CPU: {AM5} | RAM: 32GB (DDR4\n3200MHz (2x16GB))"),
        _quote({"CPU": "Ryzen 5 5600 (Socket AM4)", "Memoria": "16 GB DDR5-5600"}),
        _quote({"Procesador": "Core Ultra 7 (Socket LGA 1851)", "RAM": "DDR4"}),
    ],
)
def test_memory_the_processor_cannot_use_is_discarded(extraction):
    findings = validar_compatibilidad(extraction)
    assert [(h.codigo.value, h.descarta) for h in findings] == [("COMPAT", True)]
    assert "solo admite memoria" in findings[0].motivo and "|" in findings[0].evidencia  # quotes both parts


@pytest.mark.parametrize(
    "specs",
    [
        {"CPU": AM5, "RAM": "32GB DDR5-5600"},
        {"CPU": "Core i5-12400 (Socket LGA 1700)", "RAM": "DDR4"},  # that platform takes both
        {"CPU": "Ryzen 5 7600", "RAM": "DDR4"},  # socket not stated
        {"CPU": AM5, "GPU": "RTX 4060 8GB memoria GDDR6"},  # graphics memory
        {"CPU": AM5, "Placa": "B650M admite memoria RAM DDR4"},  # what a board says it supports
        {"CPU": AM5, "RAM": "DDR5", "RAM anterior": "memoria DDR4"},  # ambiguous
        {"CPU": AM5, "RAM": "LPDDR5"},
    ],
)
def test_memory_that_is_not_clearly_wrong_adds_nothing(specs):
    assert validar_compatibilidad(_quote(specs)) == []


def test_without_power_data_energy_is_not_verified():
    assert "CAPACIDAD" in unverified_checks(_quote({"Fuente": "no indicada", "Protección": "Regulador AVR 1200VA"}))


def test_energy_is_verified_when_a_supply_is_compared_with_the_consumption():
    extraction = _quote({"cpu_tdp_w": "65 W", "potencia_fuente_w": "650 W"})
    assert "CAPACIDAD" not in unverified_checks(extraction)
    assert "CAPACIDAD" in unverified_checks(_quote({"potencia_fuente_w": "650 W"}))  # nothing to compare with


@pytest.mark.parametrize(
    "extraction",
    [
        _quote({"Condición": "NUEVO"}),
        _quote(evidence="Estación Estudiantes Condición: NUEVO | Uniformidad: Sí"),
        _quote(notes=["Todos los equipos son nuevos y con garantía."]),
        _quote(notes=["Hardware 100% nuevo"]),
    ],
)
def test_a_declaration_of_new_goods_answers_the_quality_question(extraction):
    assert "CALIDAD" not in unverified_checks(extraction)


@pytest.mark.parametrize(
    "notes",
    [[], ["Entrega en Nuevo Circo, Caracas"], ["Esta es una nueva propuesta"], ["Los equipos no son nuevos"],
     ["Equipos no nuevos"]],
)  # fmt: skip
def test_silence_or_other_uses_of_new_do_not_answer_it(notes):
    extraction = _quote(notes=notes, cantidad=Monto(literal="1", valor="1"))
    assert "CALIDAD" in unverified_checks(extraction)
