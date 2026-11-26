"""Fragmentos para RAG y fragmentación pura (sin dependencias)."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Chunk:
    id: str
    tenant_id: str
    proposal_id: str
    order: int
    content: str


@dataclass(frozen=True, slots=True)
class SearchResult:
    chunk: Chunk
    score: float  # similitud coseno, mayor es mejor


def chunk(text: str, size: int = 450, overlap: int = 60) -> list[str]:
    """Ventanas con solape, cortando en salto de línea o espacio cuando es posible."""
    if size <= overlap:
        raise ValueError("El tamaño debe ser mayor que el solape.")
    text = text.strip()
    parts: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + size, len(text))
        if end < len(text):
            cutoff = max(text.rfind("\n", start, end), text.rfind(" ", start, end))
            end = cutoff if cutoff > start + size // 2 else end
        part = text[start:end].strip()
        if part:
            parts.append(part)
        if end >= len(text):
            break
        start = max(end - overlap, start + 1)
    return parts
