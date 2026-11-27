"""Puerto de lectura de documentos: bytes de un archivo -> texto con marcas, sin ejecutar nada del archivo."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


@dataclass(frozen=True, slots=True)
class ContenidoLeido:
    """`texto` conserva fórmulas, comentarios y contenido oculto (marcado `[OCULTO]`) para que el detector de
    instrucciones y el modelo lo vean; `avisos` lista dónde había contenido oculto o dudoso (para el informe)."""

    texto: str
    avisos: list[str] = field(default_factory=list)
    incomplete: bool = False  # part of the document could not be read: a person must review it
    scanned_pages: tuple[int, ...] = ()  # 1-based PDF pages that carry graphics but no text layer


@dataclass(frozen=True, slots=True)
class OcrResult:
    """What an OCR engine read from one image."""

    markdown: str
    text: str  # same content as plain lines, cells separated by " | "
    confidence: float  # mean word confidence, 0 to 100
    doubtful_figures: tuple[str, ...] = ()  # words with digits the engine was unsure about

    @property
    def reliable(self) -> bool:
        """Good enough to decide on. A single misread digit could discard an honest quote, so figures must be sure."""
        return len(self.text.strip()) >= 20 and self.confidence >= 75 and not self.doubtful_figures

    @property
    def readable(self) -> bool:
        """Good enough to show a person, who sees the doubtful figures highlighted."""
        return len(self.text.strip()) >= 20 and self.confidence >= 85 and len(self.doubtful_figures) <= 3


class OcrEngine(Protocol):
    def __call__(self, image: bytes) -> OcrResult:
        """Raises DatoInvalido for an unreadable image file."""
        ...


@dataclass(frozen=True, slots=True)
class MarkdownDocument:
    markdown: str
    engine: str  # what extracted it, shown to the person
    notices: tuple[str, ...] = ()


class MarkdownExtractor(Protocol):
    def __call__(self, filename: str, data: bytes) -> MarkdownDocument: ...
