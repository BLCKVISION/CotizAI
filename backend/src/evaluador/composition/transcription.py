"""Composition of image transcription: OCR first, then the vision model. It does not need the embeddings."""

from __future__ import annotations

import threading

from evaluador.adapters.outbound.extraccion.lector import image_mime
from evaluador.adapters.outbound.extraccion.transcription import transcribe_image
from evaluador.adapters.outbound.ia.fabrica import crear_modelo
from evaluador.application.ports.agente import ModeloConVision
from evaluador.application.ports.documentos import OcrEngine
from evaluador.application.ports.transcription import ImageTranscriber, Transcription
from evaluador.composition.configuracion import Configuracion
from evaluador.domain.errores import ServicioNoDisponible

_OCR_NOTICE = "leído con OCR (Tesseract), sin usar IA"


def lazy_transcriber(
    config: Configuracion | None, vision: ModeloConVision | None = None, ocr: OcrEngine | None = None
) -> ImageTranscriber:
    lock = threading.Lock()
    built: list[ModeloConVision] = [vision] if vision is not None else []

    def model() -> ModeloConVision:
        with lock:
            if not built:
                candidate = crear_modelo(config) if config is not None else None
                if not hasattr(candidate, "estructurar_imagen"):
                    raise ServicioNoDisponible("Transcribir imágenes requiere un modelo con visión configurado.")
                built.append(candidate)  # type: ignore[arg-type]
            return built[0]

    def transcribe(filename: str, data: bytes) -> Transcription:
        image_mime(filename, data)  # reject anything that is not a supported image before reading it
        read = ocr(data) if ocr is not None else None
        if read is not None and (read.reliable or read.readable):
            if not read.doubtful_figures:
                return Transcription(read.markdown, (), "high", (_OCR_NOTICE,), "ocr")
            notices = (_OCR_NOTICE, f"cifras dudosas: revise {len(read.doubtful_figures)} valor(es) resaltado(s)")
            return Transcription(read.markdown, read.doubtful_figures, "medium", notices, "ocr")
        try:
            return transcribe_image(filename, data, model())
        except Exception:
            if read is None or not read.text.strip():
                raise
            # The model is not available: what OCR could read is still useful, clearly flagged.
            notices = (_OCR_NOTICE, "el OCR no está seguro del texto: revise las cifras")
            return Transcription(read.markdown, read.doubtful_figures, "low", notices, "ocr")

    return transcribe
