"""Fragmentos para RAG y fragmentación pura (sin dependencias)."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Fragmento:
    id: str
    tenant_id: str
    propuesta_id: str
    orden: int
    contenido: str


@dataclass(frozen=True, slots=True)
class ResultadoBusqueda:
    fragmento: Fragmento
    puntaje: float  # similitud coseno, mayor es mejor


def fragmentar(texto: str, tamano: int = 450, solape: int = 60) -> list[str]:
    """Ventanas con solape, cortando en salto de línea o espacio cuando es posible."""
    if tamano <= solape:
        raise ValueError("El tamaño debe ser mayor que el solape.")
    texto = texto.strip()
    piezas: list[str] = []
    inicio = 0
    while inicio < len(texto):
        fin = min(inicio + tamano, len(texto))
        if fin < len(texto):
            corte = max(texto.rfind("\n", inicio, fin), texto.rfind(" ", inicio, fin))
            fin = corte if corte > inicio + tamano // 2 else fin
        pieza = texto[inicio:fin].strip()
        if pieza:
            piezas.append(pieza)
        if fin >= len(texto):
            break
        inicio = max(fin - solape, inicio + 1)
    return piezas
