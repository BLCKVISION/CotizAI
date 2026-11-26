"""Aritmética solo con Decimal y coincidencia exacta. Nunca la hace el modelo."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation

from evaluador.domain.evaluacion import CodigoHallazgo, Hallazgo, Origen, Severidad
from evaluador.domain.extraccion import ExtraccionPropuesta, Monto


def _d(m: Monto) -> Decimal | None:
    try:
        d = Decimal(m.valor)
    except (InvalidOperation, ValueError):
        return None
    # NaN/Infinity y exponentes absurdos no son montos: se tratan como ilegibles (revisión humana).
    return d if d.is_finite() and abs(d.adjusted()) <= 30 else None


def _hallazgo(motivo: str, evidencia: str) -> Hallazgo:
    return Hallazgo(CodigoHallazgo.ARITMETICA, Severidad.CRITICA, True, motivo, evidencia, Origen.REGLA)


def validar_aritmetica(e: ExtraccionPropuesta) -> list[Hallazgo]:
    hallazgos: list[Hallazgo] = []
    suma = Decimal(0)
    suma_valida = True
    for i, ln in enumerate(e.lineas, start=1):
        cant, precio, total = _d(ln.cantidad), _d(ln.precio_unitario), _d(ln.total_linea)
        if None in (cant, precio, total):
            hallazgos.append(
                Hallazgo(
                    CodigoHallazgo.LECTURA,
                    Severidad.ADVERTENCIA,
                    False,
                    f"Línea {i}: monto ilegible o no numérico.",
                    ln.evidencia.texto,
                    Origen.REGLA,
                )
            )
            suma_valida = False
            continue
        if cant * precio != total:
            hallazgos.append(
                _hallazgo(
                    f"Línea {i}: {cant} × {precio} = {cant * precio}, el documento dice {total}.", ln.evidencia.texto
                )
            )
        suma += total

    subtotal = e.totales.subtotal
    sub = _d(subtotal) if subtotal else None
    if subtotal and sub is not None and suma_valida and sub != suma:
        hallazgos.append(
            _hallazgo(f"La suma de líneas ({suma}) no coincide con el subtotal ({sub}).", subtotal.literal)
        )

    total_m = e.totales.total
    total = _d(total_m) if total_m else None
    if total_m and total is not None and sub is not None:
        impuestos = [_d(x) for x in e.totales.impuestos]
        if (
            all(i is not None for i in impuestos)
            and sub + sum((i for i in impuestos if i is not None), Decimal(0)) != total
        ):
            hallazgos.append(_hallazgo("Subtotal + impuestos no coincide con el total.", total_m.literal))
    return hallazgos
