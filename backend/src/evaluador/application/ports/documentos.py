"""Puerto de lectura de documentos: bytes de un archivo -> texto con marcas, sin ejecutar nada del archivo."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True, slots=True)
class ContenidoLeido:
    """`texto` conserva fórmulas, comentarios y contenido oculto (marcado `[OCULTO]`) para que el detector de
    instrucciones y el modelo lo vean; `avisos` lista dónde había contenido oculto o dudoso (para el informe)."""

    texto: str
    avisos: list[str] = field(default_factory=list)
