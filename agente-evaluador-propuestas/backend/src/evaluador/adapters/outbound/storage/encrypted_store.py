"""Almacén de archivos cifrado en reposo: AES-256-GCM, un nonce aleatorio por archivo y AAD = tenant + clave.

- Un archivo copiado a otro tenant o a otra clave no descifra (el AAD no coincide) y toda alteración se detecta.
- La ruta en disco sale de un hash: la `key` y el `tenant_id` nunca se usan como ruta (sin path traversal).
- Escritura atómica (temporal + rename) con permisos 0600; carpetas 0700.
- La clave de 32 bytes la entrega la composición desde un secreto fuera del repositorio y de la base de datos.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import os
import tempfile
from pathlib import Path

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from evaluador.domain.errors import InvalidData, NotFound

KEY_BYTES = 32
_NONCE_BYTES = 12
_TAG_BYTES = 16


def load_key(value: str) -> bytes:
    """Interpreta una clave en base64 que decodifica a exactamente 32 bytes. El mensaje nunca incluye el valor."""
    try:
        key = base64.b64decode(value.strip(), validate=True)
    except (binascii.Error, ValueError):
        raise InvalidData("La clave de cifrado no es base64 válido.") from None
    if len(key) != KEY_BYTES:
        raise InvalidData(f"La clave de cifrado debe tener {KEY_BYTES} bytes.")
    return key


def _digest(*parts: str) -> str:
    h = hashlib.sha256()
    for part in parts:
        raw = part.encode("utf-8", errors="surrogatepass")
        h.update(len(raw).to_bytes(4, "big"))  # prefijo de longitud: ("a","bc") != ("ab","c")
        h.update(raw)
    return h.hexdigest()


def _aad(tenant_id: str, key: str) -> bytes:
    return bytes.fromhex(_digest(tenant_id, key))


class EncryptedFileStore:
    def __init__(self, root: Path | str, key: bytes) -> None:
        if len(key) != KEY_BYTES:
            raise InvalidData(f"La clave de cifrado debe tener {KEY_BYTES} bytes.")
        self._aes = AESGCM(key)
        self._root = Path(root)
        self._make_dir(self._root)

    @staticmethod
    def _make_dir(path: Path) -> None:
        path.mkdir(mode=0o700, parents=True, exist_ok=True)
        path.chmod(0o700)  # mkdir respeta el umask; esto fija el modo exacto

    def _path(self, tenant_id: str, key: str) -> Path:
        return self._root / _digest("tenant", tenant_id)[:32] / _digest("file", tenant_id, key)

    def put(self, tenant_id: str, key: str, data: bytes) -> None:
        path = self._path(tenant_id, key)
        self._make_dir(path.parent)
        nonce = os.urandom(_NONCE_BYTES)
        blob = nonce + self._aes.encrypt(nonce, data, _aad(tenant_id, key))
        fd, tmp = tempfile.mkstemp(prefix=".tmp-", dir=path.parent)
        try:
            with os.fdopen(fd, "wb") as f:
                os.fchmod(f.fileno(), 0o600)
                f.write(blob)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, path)
        except BaseException:
            Path(tmp).unlink(missing_ok=True)
            raise

    def get(self, tenant_id: str, key: str) -> bytes:
        path = self._path(tenant_id, key)
        try:
            blob = path.read_bytes()
        except FileNotFoundError:
            raise NotFound("Archivo no encontrado.") from None
        if len(blob) < _NONCE_BYTES + _TAG_BYTES:
            raise InvalidData("El archivo almacenado está dañado o fue alterado.")
        try:
            return self._aes.decrypt(blob[:_NONCE_BYTES], blob[_NONCE_BYTES:], _aad(tenant_id, key))
        except InvalidTag:
            raise InvalidData("El archivo almacenado está dañado o fue alterado.") from None

    def delete(self, tenant_id: str, key: str) -> None:
        self._path(tenant_id, key).unlink(missing_ok=True)
