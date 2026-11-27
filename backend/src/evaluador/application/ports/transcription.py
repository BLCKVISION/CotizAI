"""Port for turning a photo of a quote into Markdown."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Protocol

Quality = Literal["high", "medium", "low"]


@dataclass(frozen=True, slots=True)
class Transcription:
    markdown: str
    uncertain: tuple[str, ...]  # figures a person must check
    quality: Quality
    notices: tuple[str, ...]
    engine: Literal["ocr", "vision"] = "vision"


class ImageTranscriber(Protocol):
    def __call__(self, filename: str, data: bytes) -> Transcription:
        """Raises DatoInvalido when the file is not a supported image matching its extension."""
        ...
