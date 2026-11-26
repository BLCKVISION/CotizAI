"""ABUSIVO: sobreprecio frente al mercado, flete desmedido, garantía solo en el exterior, prueba que luego se cobra.

El enunciado no fija cuándo un precio es desproporcionado: el umbral es configurable y **una sola fuente de
mercado no basta para descartar** (queda como advertencia). Las cláusulas se citan textualmente.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass
from decimal import Decimal

from evaluador.domain.errores import DatoInvalido
from evaluador.domain.evaluacion import CodigoHallazgo, Hallazgo, Origen, Severidad
from evaluador.domain.extraccion import ExtraccionPropuesta
from evaluador.domain.montos import base_de, leer_monto

_FUERA = r"(exterior|extranjero|fuera\s+del\s+pa[ií]s|fuera\s+de\s+venezuela|abroad|overseas)"
_SOLO = r"(solo|s[oó]lo|[uú]nicamente|exclusivamente|only)"
_GARANTIA_EXTERIOR = re.compile(
    rf"garant[ií]a[^.\n]{{0,60}}?{_SOLO}\s+(?:\w+\s+){{0,2}}?(?:en\s+el\s+|en\s+|con\s+validez\s+en\s+(?:el\s+)?)?{_FUERA}|"
    rf"warranty[^.\n]{{0,40}}?{_SOLO}[^.\n]{{0,15}}?{_FUERA}|"
    rf"{_SOLO}\s+(?:en|con\s+validez\s+en)\s+el\s+{_FUERA}",
    re.IGNORECASE,
)
# Cobro posterior de una prueba. Las negaciones ('no se cobra', 'gratis', 'sin costo', 'costo cero') no cuentan.
_PRUEBA_COBRADA = re.compile(
    r"(prueba|test|diagn[oó]stico)[^.\n]{0,40}?"
    r"(se\s+cobra(?:r[aá])?|ser[aá]\s+cobrad\w+|se\s+factura|tiene\s+costo|tendr[aá]\s+costo|con\s+costo)",
    re.IGNORECASE,
)
_NEGACION_DE_COBRO = re.compile(r"\b(no|sin|gratis|gratuit\w*|libre)\b", re.IGNORECASE)
_COBRO_EN_CERO = re.compile(r"\s*(cero|alguno)\b", re.IGNORECASE)


def _prueba_cobrada(texto: str) -> re.Match[str] | None:
    for m in _PRUEBA_COBRADA.finditer(texto):
        negada = _NEGACION_DE_COBRO.search(m.group(0)) or _COBRO_EN_CERO.match(texto[m.end() : m.end() + 10])
        if not negada:
            return m
    return None


def _garantia_exterior(texto: str) -> re.Match[str] | None:
    return _GARANTIA_EXTERIOR.search(texto)


_CLAUSULAS = (
    ("Garantía válida solo en el exterior", _garantia_exterior),
    ("Prueba que luego se cobra", _prueba_cobrada),
)


@dataclass(frozen=True, slots=True)
class ReferenciaDeMercado:
    precio_unitario: Decimal
    moneda: str
    fuentes: int  # cuántas fuentes independientes respaldan el precio


@dataclass(frozen=True, slots=True)
class ParametrosDeAbuso:
    umbral_sobreprecio: Decimal = Decimal("0.30")  # 30 % sobre el precio de mercado
    min_fuentes: int = 2
    umbral_flete: Decimal = Decimal("0.15")  # 15 % de la base

    def __post_init__(self) -> None:
        if self.umbral_sobreprecio < 0 or self.umbral_flete < 0 or self.min_fuentes < 1:
            raise DatoInvalido("Parámetros de abuso inválidos.")


def _pct(fraccion: Decimal) -> str:
    return f"{(fraccion * 100).normalize():f}"


def _hallazgo(
    motivo: str, cita: str, *, descarta: bool = True, codigo: CodigoHallazgo = CodigoHallazgo.ABUSIVO
) -> Hallazgo:
    severidad = Severidad.CRITICA if descarta else Severidad.ADVERTENCIA
    return Hallazgo(codigo, severidad, descarta, motivo, cita[:200], Origen.REGLA)


def _sobreprecios(
    e: ExtraccionPropuesta, referencias: Mapping[int, ReferenciaDeMercado], p: ParametrosDeAbuso
) -> list[Hallazgo]:
    hallazgos: list[Hallazgo] = []
    for n, ref in sorted(referencias.items()):
        if not 1 <= n <= len(e.lineas):
            raise DatoInvalido(f"Referencia de mercado para una línea inexistente ({n}).")
        ln = e.lineas[n - 1]
        precio = leer_monto(ln.precio_unitario)
        cita = ln.evidencia.texto or ln.descripcion
        if precio is None or ref.precio_unitario <= 0:
            continue  # el precio ilegible ya lo reporta la aritmética
        if not e.moneda or e.moneda.strip().upper() != ref.moneda.strip().upper():
            hallazgos.append(
                _hallazgo(
                    f"Línea {n}: referencia de mercado en {ref.moneda} y propuesta en "
                    f"{e.moneda or 'moneda no indicada'}; "
                    "convierta antes de comparar.",
                    cita,
                    descarta=False,
                    codigo=CodigoHallazgo.LECTURA,
                )
            )
            continue
        limite = ref.precio_unitario * (1 + p.umbral_sobreprecio)
        if precio > limite:
            exceso = ((precio / ref.precio_unitario) - 1) * 100
            motivo = (
                f"Línea {n}: precio {precio} supera en {exceso.quantize(Decimal('0.1'))} % al de mercado "
                f"({ref.precio_unitario}; umbral {_pct(p.umbral_sobreprecio)} %)."
            )
            if ref.fuentes >= p.min_fuentes:
                hallazgos.append(_hallazgo(motivo, cita))
            else:
                hallazgos.append(_hallazgo(motivo + " Una sola fuente no basta para descartar.", cita, descarta=False))
    return hallazgos


def _flete(e: ExtraccionPropuesta, p: ParametrosDeAbuso) -> list[Hallazgo]:
    flete, base = leer_monto(e.condiciones.flete), base_de(e)
    if flete is None or base is None or base <= 0:
        return []  # sin monto o sin base no hay proporción que juzgar
    proporcion = flete / base
    if proporcion > p.umbral_flete:
        literal = e.condiciones.flete.literal if e.condiciones.flete else str(flete)
        return [
            _hallazgo(
                f"Flete desmedido: {flete} es el {(proporcion * 100).quantize(Decimal('0.1'))} % de la base "
                f"(umbral {_pct(p.umbral_flete)} %).",
                literal,
            )
        ]
    return []


def _clausulas(e: ExtraccionPropuesta) -> list[Hallazgo]:
    textos = [t for t in (e.condiciones.garantia, e.condiciones.soporte, *e.notas_literales) if t]
    hallazgos: list[Hallazgo] = []
    for etiqueta, buscar in _CLAUSULAS:
        for texto in textos:
            if encontrado := buscar(texto):
                hallazgos.append(
                    _hallazgo(f"{etiqueta}.", texto[max(0, encontrado.start() - 20) : encontrado.end() + 20])
                )
                break  # una cita por cláusula basta
    return hallazgos


def validar_abuso(
    e: ExtraccionPropuesta,
    referencias: Mapping[int, ReferenciaDeMercado] | None = None,
    p: ParametrosDeAbuso | None = None,
) -> list[Hallazgo]:
    p = p or ParametrosDeAbuso()
    return [*_sobreprecios(e, referencias or {}, p), *_flete(e, p), *_clausulas(e)]
