"""Entidades de gestión: propuestas cargadas, proveedores, notas del comité y eventos de auditoría."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime

from .errores import DatoInvalido

MAX_PROPUESTAS = 20
MIN_PROPUESTAS = 3
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
