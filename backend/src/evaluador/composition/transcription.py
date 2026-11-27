"""Composition of image transcription. It only needs the vision model, not the embeddings of the evaluation."""

from __future__ import annotations

import threading

from evaluador.adapters.outbound.extraccion.transcription import transcribe_image
from evaluador.adapters.outbound.ia.fabrica import crear_modelo
from evaluador.application.ports.agente import ModeloConVision
from evaluador.application.ports.transcription import ImageTranscriber, Transcription
from evaluador.composition.configuracion import Configuracion
from evaluador.domain.errores import ServicioNoDisponible


def lazy_transcriber(config: Configuracion | None, vision: ModeloConVision | None = None) -> ImageTranscriber:
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
        return transcribe_image(filename, data, model())

    return transcribe
