"""Costo real de una propuesta: base + flete + instalación + recargos + impuestos que no estén ya incluidos.

Solo código y `Decimal`. Cada paso se conserva para mostrarlo en el informe, con la base de cada porcentaje.
Un costo anunciado sin cifra es **no determinado** (`monto=None`): no se trata como cero ni se esconde.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from decimal import Decimal

from .extraccion import ExtraccionPropuesta, Monto
from .moneda import TasaDeCambio, convertir
from .montos import a_centavos, base_de, leer_monto
from .reglas.alcance import normalizar_categoria


@dataclass(frozen=True, slots=True)
class PasoDeCosto:
    concepto: str
    monto: Decimal | None  # None = no determinado
    detalle: str = ""


@dataclass(frozen=True, slots=True)
class CostoReal:
    moneda: str | None
    pasos: tuple[PasoDeCosto, ...]

    @property
    def indeterminados(self) -> tuple[str, ...]:
        return tuple(p.concepto for p in self.pasos if p.monto is None)

    @property
    def completo(self) -> bool:
        return not self.indeterminados

    @property
    def suma_parcial(self) -> Decimal:
        """Lo que sí se sabe. No es el costo real si `completo` es falso."""
        return sum((p.monto for p in self.pasos if p.monto is not None), Decimal(0))

    @property
    def total(self) -> Decimal | None:
        """Costo real; `None` mientras falte algún monto (para ordenar se trata como desconocido)."""
        return self.suma_parcial if self.completo else None


@dataclass(frozen=True, slots=True)
class CostoConvertido:
    costo: CostoReal
    moneda: str
    total: Decimal | None
    tasas: tuple[TasaDeCambio, ...]


def _no_negativo(valor: Decimal | None) -> Decimal | None:
    """Un flete, recargo o impuesto negativo reduciría el costo: es dato corrupto o manipulado, no un descuento."""
    return valor if valor is not None and valor >= 0 else None


def _paso_de_condicion(
    concepto: str, monto: Monto | None, categoria_en_lineas: str, e: ExtraccionPropuesta
) -> list[PasoDeCosto]:
    if monto is None:
        return []  # no consta: no hay nada que sumar
    if any(normalizar_categoria(ln.categoria) == categoria_en_lineas for ln in e.lineas):
        return [PasoDeCosto(concepto, Decimal(0), "ya incluido en las líneas de la propuesta")]
    valor = _no_negativo(leer_monto(monto))
    if valor is None:
        return [PasoDeCosto(concepto, None, f"no determinado (el documento dice: {monto.literal[:60]!r})")]
    return [PasoDeCosto(concepto, valor, f"según el documento: {monto.literal[:60]}")]


def _pasos_de_recargos(e: ExtraccionPropuesta, base: Decimal | None) -> list[PasoDeCosto]:
    pasos: list[PasoDeCosto] = []
    for r in e.condiciones.recargos:
        concepto = f"Recargo: {r.concepto[:60]}"
        if r.monto is not None and (valor := _no_negativo(leer_monto(r.monto))) is not None:
            pasos.append(PasoDeCosto(concepto, valor, f"según el documento: {r.monto.literal[:60]}"))
        elif (
            r.porcentaje is not None
            and (pct := _no_negativo(leer_monto(r.porcentaje))) is not None
            and base is not None
        ):
            pasos.append(PasoDeCosto(concepto, a_centavos(base * pct / 100), f"{pct} % sobre la base {base}"))
        else:
            pasos.append(PasoDeCosto(concepto, None, "no determinado: sin monto ni porcentaje legible y no negativo"))
    return pasos


def _impuestos_declarados(e: ExtraccionPropuesta) -> list[Decimal | None]:
    return [_no_negativo(leer_monto(i)) for i in e.totales.impuestos]


def _pasos_de_impuestos(e: ExtraccionPropuesta, incluidos: bool) -> list[PasoDeCosto]:
    if not e.totales.impuestos:
        return []
    if incluidos:
        # El total declarado ya coincide con la base (más extras): los precios llevan el impuesto incluido.
        return [PasoDeCosto("Impuestos", Decimal(0), "ya incluidos en el total declarado")]
    pasos: list[PasoDeCosto] = []
    for i, (impuesto, valor) in enumerate(zip(e.totales.impuestos, _impuestos_declarados(e), strict=True), start=1):
        pasos.append(
            PasoDeCosto(f"Impuesto {i}", valor, f"según el documento: {impuesto.literal[:60]}")
            if valor is not None
            else PasoDeCosto(f"Impuesto {i}", None, "no determinado: monto ilegible o negativo")
        )
    return pasos


def _normalizar_moneda(moneda: str | None) -> str | None:
    return (moneda.strip().upper() or None) if moneda else None


def calcular_costo_real(e: ExtraccionPropuesta) -> CostoReal:
    base = base_de(e)
    origen = "subtotal declarado" if leer_monto(e.totales.subtotal) is not None else "suma de las líneas"
    pasos = [
        PasoDeCosto(
            "Monto base",
            base,
            origen if base is not None else "no determinado: no hay líneas o hay montos ilegibles",
        ),
        *_paso_de_condicion("Flete o traslado", e.condiciones.flete, "flete", e),
        *_paso_de_condicion("Instalación", e.condiciones.instalacion, "instalacion", e),
        *_pasos_de_recargos(e, base),
    ]
    extras = sum((p.monto for p in pasos[1:] if p.monto is not None), Decimal(0))
    declarado = leer_monto(e.totales.total)
    incluidos = base is not None and declarado is not None and declarado in (base, base + extras)
    pasos += _pasos_de_impuestos(e, incluidos)
    if base is not None and declarado is not None:
        # El total declarado debe poder explicarse con lo que se sumó. Si no, no se elige en silencio la cifra
        # más barata: queda «no determinado» y la propuesta va a revisión.
        itemizados = sum((i for i in _impuestos_declarados(e) if i is not None), Decimal(0))
        plausibles = {base, base + extras, base + itemizados, base + extras + itemizados}
        if declarado not in plausibles:
            pasos.append(
                PasoDeCosto(
                    "Diferencia sin explicar frente al total declarado",
                    None,
                    f"el documento declara {declarado} y lo desglosado no lo explica",
                )
            )
    return CostoReal(moneda=_normalizar_moneda(e.moneda), pasos=tuple(pasos))


def convertir_costo(costo: CostoReal, moneda_destino: str, tasas: Iterable[TasaDeCambio]) -> CostoConvertido:
    """Lanza `TasaNoDisponible` si hace falta convertir y no hay tasa: nunca se inventa una."""
    total = costo.total
    if total is None or costo.moneda is None:
        # Sin moneda declarada no se puede convertir; sin total completo no hay nada fiable que convertir.
        return CostoConvertido(costo, moneda_destino, None, ())
    convertido, usadas = convertir(total, costo.moneda, moneda_destino, tasas)
    return CostoConvertido(costo, moneda_destino, convertido, usadas)
