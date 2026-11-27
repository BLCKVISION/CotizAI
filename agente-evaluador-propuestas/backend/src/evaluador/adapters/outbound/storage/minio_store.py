"""Almacén de archivos sobre MinIO/S3. El archivo se cifra en el cliente (AES-256-GCM) ANTES de subirlo.

MinIO nunca ve contenido legible ni identificadores reales: el nombre del objeto es un hash de (tenant, clave) y el
AAD ata el cifrado a ese par, así que un objeto copiado a otro nombre no descifra. Cumple el puerto `FileStore`.
Los errores del servicio se traducen a `ServiceUnavailable` sin detalle interno (host, usuario ni claves).
"""

from __future__ import annotations

import io
import logging
from typing import Any

from minio.error import S3Error

from evaluador.domain.errors import InvalidData, NotFound, ServiceUnavailable

from .sealing import Sealer

_log = logging.getLogger("evaluador.storage")
_MISSING = {"NoSuchKey", "NoSuchObject", "NotFound"}
_UNAVAILABLE = "El almacén de archivos no está disponible. Intente de nuevo en unos minutos."


class MinioFileStore:
    def __init__(self, client: Any, bucket: str, key: bytes) -> None:
        if not bucket.strip():
            raise InvalidData("El nombre del bucket no puede estar vacío.")
        self._client, self._bucket, self._sealer = client, bucket.strip(), Sealer(key)

    def _unavailable(self, op: str, exc: Exception) -> ServiceUnavailable:
        # Solo el tipo de error y el código S3: nunca el mensaje, que puede incluir host, usuario o claves.
        _log.error("storage_failed", extra={"op": op, "type": type(exc).__name__, "code": getattr(exc, "code", None)})
        return ServiceUnavailable(_UNAVAILABLE)

    def put(self, tenant_id: str, key: str, data: bytes) -> None:
        blob = self._sealer.seal(tenant_id, key, data)
        try:
            self._client.put_object(
                self._bucket, self._sealer.object_name(tenant_id, key), io.BytesIO(blob), len(blob),
                content_type="application/octet-stream",
            )  # fmt: skip
        except Exception as exc:  # noqa: BLE001 - cualquier fallo del servicio es «no disponible», sin filtrar detalle
            raise self._unavailable("put", exc) from None

    def get(self, tenant_id: str, key: str) -> bytes:
        response = None
        try:
            response = self._client.get_object(self._bucket, self._sealer.object_name(tenant_id, key))
            blob = response.read()
        except S3Error as exc:
            if exc.code in _MISSING:
                raise NotFound("Archivo no encontrado.") from None
            raise self._unavailable("get", exc) from None
        except Exception as exc:  # noqa: BLE001
            raise self._unavailable("get", exc) from None
        finally:
            if response is not None:  # siempre se devuelve la conexión al pool
                response.close()
                response.release_conn()
        return self._sealer.open(tenant_id, key, blob)

    def delete(self, tenant_id: str, key: str) -> None:
        try:
            self._client.remove_object(self._bucket, self._sealer.object_name(tenant_id, key))
        except Exception as exc:  # noqa: BLE001
            raise self._unavailable("delete", exc) from None
