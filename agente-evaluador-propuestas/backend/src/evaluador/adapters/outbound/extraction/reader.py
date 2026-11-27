"""Punto de entrada: decide el tipo por el CONTENIDO (firma) y comprueba que coincida con la extensión."""

from __future__ import annotations

from pathlib import PurePath

from evaluador.application.ports.agent import VisionModel
from evaluador.application.ports.documents import ReadContent
from evaluador.domain.errors import InvalidData

from .image import read_image
from .pdf import read_pdf
from .xlsx import read_xlsx

MAX_BYTES = 25 * 1024 * 1024
_EXTENSIONS = {".pdf": "pdf", ".xlsx": "xlsx", ".png": "png", ".jpg": "jpeg", ".jpeg": "jpeg", ".webp": "webp"}
_MIME = {"png": "image/png", "jpeg": "image/jpeg", "webp": "image/webp"}


def _type_by_content(data: bytes) -> str | None:
    if data.startswith(b"%PDF-"):
        return "pdf"
    if data.startswith(b"PK\x03\x04"):
        return "xlsx"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return None


def allowed_extensions() -> frozenset[str]:
    return frozenset(_EXTENSIONS)


def detect_type(data: bytes) -> str | None:
    """Tipo real por la firma del contenido (`pdf`, `xlsx`, `png`, `jpeg`, `webp`) o None si no se reconoce."""
    return _type_by_content(data)


def type_by_extension(name: str) -> str | None:
    """Tipo que anuncia la extensión, solo si está admitida (.xlsm, .xls, etc. devuelven None)."""
    return _EXTENSIONS.get(PurePath(name).suffix.lower())


def read_document(name: str, data: bytes, vision: VisionModel | None = None) -> ReadContent:
    expected = _EXTENSIONS.get(PurePath(name).suffix.lower())
    if expected is None:
        raise InvalidData("Tipo de archivo no admitido.")
    if len(data) > MAX_BYTES:
        raise InvalidData("El archivo excede el tamaño máximo permitido.")
    if _type_by_content(data) != expected:
        raise InvalidData("El contenido del archivo no corresponde a su extensión.")
    if expected == "pdf":
        return read_pdf(data, vision=vision)
    if expected == "xlsx":
        return read_xlsx(data)
    if vision is None:
        raise InvalidData("Leer imágenes requiere un modelo con visión configurado.")
    return read_image(data, _MIME[expected], vision)
