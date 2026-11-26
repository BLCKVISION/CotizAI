"""Almacén de documentos cifrados en disco con AES-256-GCM. El nombre original nunca se usa como ruta."""

from __future__ import annotations

import base64
import binascii
import os
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


class AlmacenCifrado:
    def __init__(self, directorio: str, clave_base64: str) -> None:
        try:
            clave = base64.b64decode(clave_base64, validate=True)
        except binascii.Error:
            clave = b""
        if len(clave) != 32:
            raise ValueError("EVALUADOR_CLAVE_CIFRADO debe ser 32 bytes en base64.")
        self._aes = AESGCM(clave)
        self._raiz = Path(directorio)

    def guardar(self, tenant_id: str, documento_id: str, contenido: bytes) -> None:
        ruta = self._ruta(tenant_id, documento_id)
        ruta.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        nonce = os.urandom(12)
        ruta.write_bytes(nonce + self._aes.encrypt(nonce, contenido, self._contexto(tenant_id, documento_id)))
        ruta.chmod(0o600)

    def leer(self, tenant_id: str, documento_id: str) -> bytes:
        datos = self._ruta(tenant_id, documento_id).read_bytes()
        return self._aes.decrypt(datos[:12], datos[12:], self._contexto(tenant_id, documento_id))

    def eliminar(self, tenant_id: str, documento_id: str) -> None:
        self._ruta(tenant_id, documento_id).unlink(missing_ok=True)

    @staticmethod
    def _contexto(tenant_id: str, documento_id: str) -> bytes:
        return f"{tenant_id}/{documento_id}".encode()  # un archivo movido a otro tenant no se puede descifrar

    def _ruta(self, tenant_id: str, documento_id: str) -> Path:
        if not all(p.replace("-", "").isalnum() for p in (tenant_id, documento_id)):
            raise ValueError("Identificador no válido.")
        return self._raiz / tenant_id / f"{documento_id}.bin"
