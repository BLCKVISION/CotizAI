"""Quotes that list one component per line: power, case and uniformity are judged per station."""

from __future__ import annotations

import pytest

from evaluador.domain.extraccion import ExtraccionPropuesta, Linea, Monto
from evaluador.domain.reglas.alcance import validar_alcance_fijo
from evaluador.domain.reglas.estaciones import validar_estaciones


def _quote(*descriptions: str, quantity: str = "10") -> ExtraccionPropuesta:
    amount = Monto(literal=quantity, valor=quantity)
    return ExtraccionPropuesta(
        lineas=[Linea(descripcion=d, categoria="componente", cantidad=amount) for d in descriptions]
    )


def _codes(extraction: ExtraccionPropuesta, document: str = "") -> set[str]:
    return {f.codigo.value for f in validar_estaciones(extraction, document) if f.descarta}


CPU = "Estudiantes Procesador: AMD Ryzen 7 7700X"
GPU = "Estudiantes Tarjeta gráfica: NVIDIA GeForce RTX 4070 Ti Super 16GB"


def test_a_supply_too_small_for_parts_on_other_lines_is_found():
    assert _codes(_quote(CPU, GPU, "Estudiantes Gabinete + Fuente (PSU): Mid-Tower | 450W Genérica")) == {"CAPACIDAD"}


@pytest.mark.parametrize("supply", ["850W 80+ Gold", "650 W 80+ Bronze"])
def test_a_big_enough_supply_passes(supply):
    assert _codes(_quote(CPU, GPU, f"Estudiantes Fuente (PSU): {supply}")) == set()


def test_a_ups_without_enough_watts_is_found_and_va_alone_is_not_judged():
    base = ("Core i7-14700", "RTX 4070 12GB")
    assert _codes(_quote(*base, "Mini UPS Forza 500VA / 250W")) == {"CAPACIDAD"}
    assert _codes(_quote(*base, "UPS Interactivo 1200VA")) == set()


def test_unknown_parts_are_never_guessed():
    assert _codes(_quote("Procesador X", "Gráfica Y", "Fuente 300W")) == set()


def test_a_full_size_card_in_a_low_profile_case():
    quote = _quote("Gabinete Slim SFF 10L (Solo GPU Low-Profile)", "Gigabyte RTX 4070 Gaming OC Triple-Fan (332mm)")
    assert "COMPAT" in _codes(quote)
    assert _codes(_quote("Gabinete Slim SFF (admite perfil bajo)", "RTX 3050 low profile")) == set()


@pytest.mark.parametrize("text", ["Core i5-13400 / Ryzen 5 5600 según lote", "Monitores 24 FHD marcas varias"])
def test_an_undefined_configuration_is_not_acceptable(text):
    assert _codes(_quote(text)) == {"CALIDAD"}


def test_the_teacher_computer_priced_whole_is_confirmed_not_discarded():
    ten, one = Monto(literal="10", valor="10"), Monto(literal="1", valor="1")
    parts = [
        "Estudiantes procesador y placa",
        "Estudiantes gabinete",
        "Estudiantes monitor",
        "Estudiantes teclado y ratón",
        "Estudiantes UPS protector",
    ]
    lines = [Linea(descripcion=d, categoria="componente", cantidad=ten) for d in parts]
    teacher = Linea(descripcion="PC Docente Ryzen 9", categoria="computadora", cantidad=one)
    findings = validar_alcance_fijo(ExtraccionPropuesta(lineas=[*lines, teacher]))
    assert not [f for f in findings if f.descarta]
    without_teacher = validar_alcance_fijo(ExtraccionPropuesta(lineas=lines))
    assert [f for f in without_teacher if f.descarta]


def test_a_model_left_out_of_the_line_is_read_from_the_document_and_never_overestimated():
    quote = _quote(
        "Estudiantes Procesador: Ryzen 7 7700X",
        "Estudiantes Tarjeta grafica (GPU) VRAM 16GB",
        "Estudiantes Fuente (PSU) 450W Generica",
    )
    assert _codes(quote, "Combo Ryzen 7 7700X + RTX 4070 Ti Super 16GB") == {"CAPACIDAD"}
    assert _codes(quote, "Docente RTX 4070 Ti Super. Estudiantes RTX 4060") == set()
    assert _codes(quote, "Sin modelo de grafica") == set()
