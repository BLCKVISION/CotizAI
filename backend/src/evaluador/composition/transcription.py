"""Composition of image transcription: the vision model, with OCR as fallback. It does not need the embeddings."""

from __future__ import annotations

import logging
import threading
from typing import Literal

from evaluador.adapters.outbound.extraccion.lector import image_mime
from evaluador.adapters.outbound.extraccion.transcription import transcribe_image
from evaluador.adapters.outbound.ia.fabrica import crear_modelo
from evaluador.application.ports.agente import ModeloConVision
from evaluador.application.ports.documentos import OcrEngine
from evaluador.application.ports.transcription import ImageTranscriber, Transcription
from evaluador.composition.configuracion import Configuracion
from evaluador.domain.errores import DatoInvalido, ServicioNoDisponible

_log = logging.getLogger("evaluador.composition")

_OCR_NOTICE = "leído con OCR de respaldo porque la IA no respondió: compare las cifras y los nombres con el documento"


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
        try:
            return transcribe_image(filename, data, model())
        except DatoInvalido:
            raise
        except Exception as exc:  # noqa: BLE001 - any provider failure falls back to OCR, without its details
            _log.warning("vision_transcription_failed", extra={"tipo": type(exc).__name__})
            # OCR is the fallback: measured on real quotes it loses letterheads and sometimes misreads figures,
            # even when it reports high confidence. So its reading is never presented as verified.
            read = ocr(data) if ocr is not None else None
            if read is None or not read.text.strip():
                raise
            quality: Literal["medium", "low"] = "medium" if read.reliable or read.readable else "low"
            return Transcription(read.markdown, read.doubtful_figures, quality, (_OCR_NOTICE,), "ocr")

    return transcribe
