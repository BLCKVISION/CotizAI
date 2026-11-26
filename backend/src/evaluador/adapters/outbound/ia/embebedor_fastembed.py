"""Embeddings gratuitos y locales (ONNX, sin GPU ni API). Multilingüe, 384 dimensiones, buen español."""

from __future__ import annotations

NOMBRE_POR_DEFECTO = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"


class EmbebedorFastEmbed:
    dimension = 384

    def __init__(self, modelo: str = NOMBRE_POR_DEFECTO, cache_dir: str | None = None) -> None:
        from fastembed import TextEmbedding  # import perezoso: la descarga del modelo ocurre al construir

        self._m = TextEmbedding(model_name=modelo, cache_dir=cache_dir)

    def embeber_documentos(self, textos: list[str]) -> list[list[float]]:
        return [v.tolist() for v in self._m.embed(textos)]

    def embeber_consulta(self, texto: str) -> list[float]:
        return self.embeber_documentos([texto])[0]
