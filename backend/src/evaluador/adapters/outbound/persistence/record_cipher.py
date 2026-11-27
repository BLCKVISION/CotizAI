"""AES-256-GCM for the records kept in the database: results, suppliers, notes, accounts and the audit trail.

The key is derived from the document key, so there is one secret to protect and the two uses never share a key.
Each record is bound to its kind, organisation and id: copied onto another row, it does not decrypt.
"""

from __future__ import annotations

import base64
import binascii
import json
import os

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

_FIELD = "aes256gcm"


class RecordCipher:
    def __init__(self, key_base64: str) -> None:
        try:
            master = base64.b64decode(key_base64, validate=True)
        except binascii.Error:
            master = b""
        if len(master) != 32:
            raise ValueError("EVALUADOR_CLAVE_CIFRADO debe ser 32 bytes en base64.")
        derived = HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=b"cotizai/database-records").derive(master)
        self._aes = AESGCM(derived)

    def seal(self, plain: str, *context: str) -> str:
        """Returns a JSON document, so it fits the same `jsonb` column as before."""
        nonce = os.urandom(12)
        sealed = nonce + self._aes.encrypt(nonce, plain.encode(), "/".join(context).encode())
        return json.dumps({_FIELD: base64.b64encode(sealed).decode()})

    def open(self, stored: str, *context: str) -> str:
        """Records written before encryption was introduced are returned as they are."""
        if not self.is_sealed(stored):
            return stored
        sealed = base64.b64decode(json.loads(stored)[_FIELD])
        return self._aes.decrypt(sealed[:12], sealed[12:], "/".join(context).encode()).decode()

    @staticmethod
    def is_sealed(stored: str) -> bool:
        value = json.loads(stored)
        return isinstance(value, dict) and set(value) == {_FIELD}
