"""Embeddings gratuitos y locales (ONNX, sin GPU ni API). Multilingüe, 384 dimensiones, buen español."""

from __future__ import annotations

DEFAULT_NAME = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"


class FastEmbedEmbedder:
    dimension = 384

    def __init__(self, model: str = DEFAULT_NAME, cache_dir: str | None = None) -> None:
        from fastembed import TextEmbedding  # import perezoso: la descarga del modelo ocurre al construir

        self._m = TextEmbedding(model_name=model, cache_dir=cache_dir)

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [v.tolist() for v in self._m.embed(texts)]

    def embed_query(self, text: str) -> list[float]:
        return self.embed_documents([text])[0]
