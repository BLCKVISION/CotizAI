"""Embedding determinista por hashing de palabras (bolsa de palabras) para pruebas sin descargar modelos."""

from __future__ import annotations

import hashlib
import math
import re


class FakeEmbedder:
    def __init__(self, dimension: int = 64) -> None:
        self._dim = dimension

    @property
    def dimension(self) -> int:
        return self._dim

    def _vec(self, text: str) -> list[float]:
        v = [0.0] * self._dim
        for word in re.findall(r"\w+", text.lower()):
            v[int(hashlib.md5(word.encode()).hexdigest(), 16) % self._dim] += 1.0  # noqa: S324
        norm = math.sqrt(sum(x * x for x in v)) or 1.0
        return [x / norm for x in v]

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self._vec(t) for t in texts]

    def embed_query(self, text: str) -> list[float]:
        return self._vec(text)
