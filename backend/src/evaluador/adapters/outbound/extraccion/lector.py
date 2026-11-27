"""Punto de entrada: decide el tipo por el CONTENIDO (firma) y comprueba que coincida con la extensión."""

from __future__ import annotations

from dataclasses import replace
from pathlib import PurePath

from evaluador.application.ports.agente import ModeloConVision
from evaluador.application.ports.documentos import ContenidoLeido
from evaluador.domain.errores import DatoInvalido

from .imagen import leer_imagen
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


def leer_documento(nombre: str, datos: bytes, vision: ModeloConVision | None = None) -> ContenidoLeido:
    esperado = _EXTENSIONES.get(PurePath(nombre).suffix.lower())
    if esperado is None:
        raise DatoInvalido("Tipo de archivo no admitido.")
    if len(datos) > MAX_BYTES:
        raise DatoInvalido("El archivo excede el tamaño máximo permitido.")
    if _tipo_por_contenido(datos) != esperado:
        raise DatoInvalido("El contenido del archivo no corresponde a su extensión.")
    if esperado == "pdf":
        content = leer_pdf(datos)
        if not content.scanned_pages:
            return content
        if vision is None:
            return replace(content, incomplete=bool(content.texto.strip()))
        return read_scanned_pages(datos, content, vision)
    if esperado == "xlsx":
        return leer_xlsx(datos)
    if vision is None:
        raise DatoInvalido("Leer imágenes requiere un modelo con visión configurado.")
    return leer_imagen(datos, _MIME[esperado], vision)
