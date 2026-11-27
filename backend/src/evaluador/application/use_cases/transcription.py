"""Transcribes the photo of a quote. Nothing is stored: the image only lives in memory."""

from __future__ import annotations

import logging

from evaluador.application.ports.transcription import ImageTranscriber, Transcription
from evaluador.domain.errores import DatoInvalido, ErrorDeDominio, PayloadTooLarge, ServicioNoDisponible
from evaluador.domain.gestion import MAX_BYTES_DOCUMENTO, UPLOAD_TOO_LARGE
from evaluador.domain.identidad import Permiso, Usuario

_log = logging.getLogger("evaluador.transcription")


class TranscribeImage:
    def __init__(self, transcriber: ImageTranscriber) -> None:
        self._transcriber = transcriber

    def execute(self, actor: Usuario, filename: str, data: bytes) -> Transcription:
        actor.exigir(Permiso.CARGAR_DOCUMENTOS)
        if not data:
            raise DatoInvalido("El archivo está vacío.")
        if len(data) > MAX_BYTES_DOCUMENTO:
            raise PayloadTooLarge(UPLOAD_TOO_LARGE)
        try:
            return self._transcriber(filename, data)
        except ErrorDeDominio:
            raise
        except Exception as exc:  # noqa: BLE001 - provider details (keys, URLs) never reach the client
            _log.warning("transcription_provider_failed", extra={"tipo": type(exc).__name__})
            raise ServicioNoDisponible(
                "El modelo de visión no pudo responder. Compruebe que el modelo configurado admita imágenes, "
                "o reintente."
            ) from exc
