"""Entidades de gestión: propuestas cargadas, proveedores, notas del comité y eventos de auditoría."""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from datetime import datetime

from .errores import DatoInvalido

MAX_PROPUESTAS = 20
MIN_PROPUESTAS = 1
# A whole project can be analysed at once, as the challenge asks. The batch CLI has no limit.
MAX_PROPOSALS_PER_RUN = 20
MAX_BYTES_DOCUMENTO = 10 * 1024 * 1024
_NOMBRE_VALIDO = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,150}$")
# extensión -> firmas válidas al inicio del archivo (el contenido manda, no solo el nombre)
_FIRMAS: dict[str, tuple[bytes, ...]] = {
    "pdf": (b"%PDF-",),
    "png": (b"\x89PNG\r\n\x1a\n",),
    "jpg": (b"\xff\xd8\xff",),
    "jpeg": (b"\xff\xd8\xff",),
    "xlsx": (b"PK\x03\x04",),
}


def sanitize_filename(name: str) -> str:
    """Turn a user file name into a safe one: drop accents, replace other characters with '_'. Paths are rejected."""
    if re.search(r"[\\/]", name) or ".." in name:
        raise DatoInvalido("Nombre de archivo no permitido: no puede incluir rutas.")
    base = name.strip()
    ascii_name = unicodedata.normalize("NFKD", base).encode("ascii", "ignore").decode("ascii")
    cleaned = re.sub(r"[^A-Za-z0-9_.-]+", "_", ascii_name).lstrip("._-")
    stem, dot, ext = cleaned.rpartition(".")
    if not dot:
        return cleaned[:150]
    return f"{stem[: 150 - len(ext) - 1]}.{ext}"


def validar_documento(nombre: str, contenido: bytes) -> str:
    """Devuelve la extensión normalizada o lanza DatoInvalido."""
    if not _NOMBRE_VALIDO.match(nombre):
        raise DatoInvalido("Nombre de archivo no permitido: use letras sin tildes, números, '_', '-' o '.'.")
    extension = nombre.rsplit(".", 1)[-1].lower() if "." in nombre else ""
    if extension not in _FIRMAS:
        raise DatoInvalido("Formato no admitido. Use PDF, JPG, PNG o XLSX.")
    if not contenido:
        raise DatoInvalido("El archivo está vacío.")
    if len(contenido) > MAX_BYTES_DOCUMENTO:
        raise DatoInvalido("El archivo supera los 10 MB.")
    if not contenido.startswith(_FIRMAS[extension]):
        raise DatoInvalido("El contenido no corresponde a la extensión del archivo.")
    return "jpg" if extension == "jpeg" else extension


@dataclass(frozen=True, slots=True)
class Propuesta:
    id: str
    tenant_id: str
    proyecto_id: str
    archivo: str
    formato: str
    tamano: int
    sha256: str
    cargado_por: str
    creado: datetime


@dataclass(frozen=True, slots=True)
class Proveedor:
    id: str
    tenant_id: str
    nombre: str
    rif: str
    ubicacion: str
    contacto: str
    creado: datetime


@dataclass(frozen=True, slots=True)
class Nota:
    id: str
    tenant_id: str
    proyecto_id: str
    autor: str
    texto: str
    creado: datetime


@dataclass(frozen=True, slots=True)
class Evento:
    id: str
    tenant_id: str
    actor: str | None
    accion: str
    detalle: str
    creado: datetime
    secuencia: int
    huella_anterior: str
    huella: str
