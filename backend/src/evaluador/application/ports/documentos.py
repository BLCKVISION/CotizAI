"""Puerto de lectura de documentos: bytes de un archivo -> texto con marcas, sin ejecutar nada del archivo."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True, slots=True)
class ContenidoLeido:
    """`texto` conserva fórmulas, comentarios y contenido oculto (marcado `[OCULTO]`) para que el detector de
    instrucciones y el modelo lo vean; `avisos` lista dónde había contenido oculto o dudoso (para el informe)."""

    texto: str
    avisos: list[str] = field(default_factory=list)
    incomplete: bool = False  # part of the document could not be read: a person must review it
    scanned_pages: tuple[int, ...] = ()  # 1-based PDF pages that carry graphics but no text layer
