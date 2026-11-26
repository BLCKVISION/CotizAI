"""Embedding determinista por hashing de palabras (bolsa de palabras) para pruebas sin descargar modelos."""

from __future__ import annotations

import hashlib
import math
import re


class EmbebedorFalso:
    def __init__(self, dimension: int = 64) -> None:
        self._dim = dimension

    @property
    def dimension(self) -> int:
        return self._dim

    def _vec(self, texto: str) -> list[float]:
        v = [0.0] * self._dim
        for palabra in re.findall(r"\w+", texto.lower()):
            v[int(hashlib.md5(palabra.encode()).hexdigest(), 16) % self._dim] += 1.0  # noqa: S324
        norma = math.sqrt(sum(x * x for x in v)) or 1.0
        return [x / norma for x in v]

    def embeber_documentos(self, textos: list[str]) -> list[list[float]]:
        return [self._vec(t) for t in textos]

    def embeber_consulta(self, texto: str) -> list[float]:
        return self._vec(texto)
