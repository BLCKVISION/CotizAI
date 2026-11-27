"""Punto de entrada: decide el tipo por el CONTENIDO (firma) y comprueba que coincida con la extensión."""

from __future__ import annotations

from dataclasses import replace
from pathlib import PurePath

from evaluador.application.ports.agente import ModeloConVision
from evaluador.application.ports.documentos import ContenidoLeido, OcrEngine
from evaluador.domain.errores import DatoInvalido

from .imagen import read_picture
from .pdf import leer_pdf
from .pdf_scanned import read_scanned_pages
from .xlsx import leer_xlsx

MAX_BYTES = 25 * 1024 * 1024
_EXTENSIONES = {".pdf": "pdf", ".xlsx": "xlsx", ".png": "png", ".jpg": "jpeg", ".jpeg": "jpeg", ".webp": "webp"}
_MIME = {"png": "image/png", "jpeg": "image/jpeg", "webp": "image/webp"}


def _tipo_por_contenido(datos: bytes) -> str | None:
    if datos.startswith(b"%PDF-"):
        return "pdf"
    if datos.startswith(b"PK\x03\x04"):
        return "xlsx"
    if datos.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if datos.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if datos[:4] == b"RIFF" and datos[8:12] == b"WEBP":
        return "webp"
    return None


def extensiones_admitidas() -> frozenset[str]:
    return frozenset(_EXTENSIONES)


def image_mime(filename: str, data: bytes) -> str:
    """MIME type of an image. The content decides the type and the extension must agree with it."""
    kind = _tipo_por_contenido(data)
    if kind not in _MIME:
        raise DatoInvalido("Solo se admiten imágenes PNG, JPG o WebP.")
    if _EXTENSIONES.get(PurePath(filename).suffix.lower()) != kind:
        raise DatoInvalido("El contenido del archivo no corresponde a su extensión.")
    return _MIME[kind]


def detect_kind(filename: str, data: bytes) -> str:
    """File type (`pdf`, `xlsx`, `png`, `jpeg`, `webp`) by content, which must agree with the extension."""
    expected = _EXTENSIONES.get(PurePath(filename).suffix.lower())
    if expected is None:
        raise DatoInvalido("Tipo de archivo no admitido.")
    if len(data) > MAX_BYTES:
        raise DatoInvalido("El archivo excede el tamaño máximo permitido.")
    if _tipo_por_contenido(data) != expected:
        raise DatoInvalido("El contenido del archivo no corresponde a su extensión.")
    return expected


def leer_documento(
    nombre: str, datos: bytes, vision: ModeloConVision | None = None, ocr: OcrEngine | None = None
) -> ContenidoLeido:
    esperado = detect_kind(nombre, datos)
    if esperado == "pdf":
        content = leer_pdf(datos)
        if not content.scanned_pages:
            return content
        if vision is None and ocr is None:
            return replace(content, incomplete=bool(content.texto.strip()))
        return read_scanned_pages(datos, content, vision, ocr)
    if esperado == "xlsx":
        return leer_xlsx(datos)
    return read_picture(datos, _MIME[esperado], vision, ocr)
