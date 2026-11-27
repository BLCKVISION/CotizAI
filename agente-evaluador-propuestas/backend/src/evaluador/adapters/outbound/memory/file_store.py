"""Almacén de archivos en memoria (pruebas). Mismo contrato y mismo aislamiento por tenant que el cifrado en disco."""

from __future__ import annotations

from threading import Lock

from evaluador.domain.errors import NotFound


class InMemoryFileStore:
    def __init__(self) -> None:
        self._data: dict[tuple[str, str], bytes] = {}
        self._lock = Lock()

    def put(self, tenant_id: str, key: str, data: bytes) -> None:
        with self._lock:
            self._data[(tenant_id, key)] = bytes(data)

    def get(self, tenant_id: str, key: str) -> bytes:
        with self._lock:
            try:
                return self._data[(tenant_id, key)]
            except KeyError:
                raise NotFound("Archivo no encontrado.") from None

    def delete(self, tenant_id: str, key: str) -> None:
        with self._lock:
            self._data.pop((tenant_id, key), None)
