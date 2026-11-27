"""Transcribe la foto de un presupuesto a Markdown. No persiste nada: la imagen vive solo en memoria."""

from __future__ import annotations

from evaluador.adapters.outbound.extraction.reader import MAX_BYTES, detect_type, type_by_extension
from evaluador.adapters.outbound.extraction.transcription import Transcription, transcribe_image
from evaluador.application.ports.agent import VisionModel
from evaluador.domain.errors import DomainError, InvalidData, PayloadTooLarge, ServiceUnavailable
from evaluador.domain.identity import Permission, User

_IMAGE_MIME = {"png": "image/png", "jpeg": "image/jpeg", "webp": "image/webp"}


class TranscribeImage:
    def __init__(self, vision: VisionModel | None) -> None:
        self._vision = vision

    def execute(self, actor: User, name: str, data: bytes) -> Transcription:
        actor.require(Permission.LOAD_DOCUMENTS)
        if self._vision is None:
            raise ServiceUnavailable("Transcribir imágenes requiere un modelo con visión configurado.")
        if not data:
            raise InvalidData("El archivo está vacío.")
        if len(data) > MAX_BYTES:
            raise PayloadTooLarge("El archivo excede el tamaño máximo permitido.")
        real = detect_type(data)  # el tipo lo decide el contenido, nunca el nombre
        if real not in _IMAGE_MIME:
            raise InvalidData("Solo se admiten imágenes PNG, JPG o WebP.")
        if type_by_extension(name) != real:
            raise InvalidData("El contenido del archivo no corresponde a su extensión.")
        try:
            return transcribe_image(data, _IMAGE_MIME[real], self._vision)
        except DomainError:
            raise
        except Exception as exc:  # noqa: BLE001 - el detalle del proveedor (claves, URLs) nunca llega al cliente
            raise ServiceUnavailable("El modelo de visión no pudo responder. Intente de nuevo.") from exc
