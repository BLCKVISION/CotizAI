"""Lectura de imágenes con un modelo de visión: transcribe a Markdown, no interpreta ni calcula."""

from __future__ import annotations

from evaluador.application.ports.agent import VisionModel
from evaluador.application.ports.documents import ReadContent

from .transcription import transcribe_image


def read_image(data: bytes, mime: str, vision: VisionModel) -> ReadContent:
    t = transcribe_image(data, mime, vision)
    return ReadContent(t.markdown, list(t.notices))
