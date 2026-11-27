"""Núcleo criptográfico compartido por los almacenes (disco y MinIO): AES-256-GCM con AAD = tenant + clave.

- Un nonce aleatorio de 12 bytes por archivo; el resultado es `nonce || cifrado+tag`.
- Un objeto copiado a otro tenant o a otra clave no descifra (el AAD no coincide) y toda alteración se detecta.
- El nombre bajo el que se guarda sale de un hash: ni `tenant_id` ni `key` se usan como ruta ni como nombre de objeto.
"""

from __future__ import annotations

import hashlib
import os

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from evaluador.domain.errors import InvalidData

KEY_BYTES = 32
_NONCE_BYTES = 12
_TAG_BYTES = 16
TAMPERED = "El archivo almacenado está dañado o fue alterado."


def _digest(*parts: str) -> str:
    h = hashlib.sha256()
    for part in parts:
        raw = part.encode("utf-8", errors="surrogatepass")
        h.update(len(raw).to_bytes(4, "big"))  # prefijo de longitud: ("a","bc") != ("ab","c")
        h.update(raw)
    return h.hexdigest()


def _aad(tenant_id: str, key: str) -> bytes:
    return bytes.fromhex(_digest(tenant_id, key))


class Sealer:
    def __init__(self, key: bytes) -> None:
        if len(key) != KEY_BYTES:
            raise InvalidData(f"La clave de cifrado debe tener {KEY_BYTES} bytes.")
        self._aes = AESGCM(key)

    @staticmethod
    def object_name(tenant_id: str, key: str) -> str:
        """`<hash del tenant>/<hash del archivo>`: estable, sin datos reales y sin riesgo de path traversal."""
        return f"{_digest('tenant', tenant_id)[:32]}/{_digest('file', tenant_id, key)}"

    def seal(self, tenant_id: str, key: str, data: bytes) -> bytes:
        nonce = os.urandom(_NONCE_BYTES)
        return nonce + self._aes.encrypt(nonce, data, _aad(tenant_id, key))

    def open(self, tenant_id: str, key: str, blob: bytes) -> bytes:
        if len(blob) < _NONCE_BYTES + _TAG_BYTES:
            raise InvalidData(TAMPERED)
        try:
            return self._aes.decrypt(blob[:_NONCE_BYTES], blob[_NONCE_BYTES:], _aad(tenant_id, key))
        except InvalidTag:
            raise InvalidData(TAMPERED) from None
