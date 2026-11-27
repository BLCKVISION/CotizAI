"""Colección persistente sobre PostgreSQL (JSONB). Toda consulta filtra por tenant_id."""

from __future__ import annotations

from typing import TypeVar

import psycopg
from pydantic import TypeAdapter

from evaluador.adapters.outbound.persistence.record_cipher import RecordCipher

T = TypeVar("T")

_ESQUEMA = """
CREATE TABLE IF NOT EXISTS registros (
    tipo      text        NOT NULL,
    tenant_id text        NOT NULL,
    id        text        NOT NULL,
    datos     jsonb       NOT NULL,
    creado    timestamptz NOT NULL,
    PRIMARY KEY (tipo, tenant_id, id)
);
"""


def preparar_esquema(url: str) -> None:
    with psycopg.connect(url) as c:
        c.execute(_ESQUEMA)


def encrypt_plain_records(url: str, cipher: RecordCipher) -> int:
    """Encrypts, in one transaction, the records stored before encryption was introduced. Safe to repeat."""
    changed = 0
    with psycopg.connect(url) as c:
        rows = c.execute("SELECT tipo, tenant_id, id, datos::text FROM registros FOR UPDATE").fetchall()
        for kind, tenant_id, record_id, data in rows:
            if cipher.is_sealed(data):
                continue
            c.execute(
                "UPDATE registros SET datos = %s::jsonb WHERE tipo = %s AND tenant_id = %s AND id = %s",
                (cipher.seal(data, kind, tenant_id, record_id), kind, tenant_id, record_id),
            )
            changed += 1
    return changed


class ColeccionPostgres[T]:
    def __init__(self, url: str, tipo: str, clase: type[T], cipher: RecordCipher | None = None) -> None:
        self._url, self._tipo, self._cipher = url, tipo, cipher
        self._adaptador: TypeAdapter[T] = TypeAdapter(clase)

    def _read(self, tenant_id: str, record_id: str, data: str) -> T:
        if self._cipher is not None:
            data = self._cipher.open(data, self._tipo, tenant_id, record_id)
        return self._adaptador.validate_json(data)

    def guardar(self, entidad: T) -> None:
        datos = self._adaptador.dump_json(entidad).decode()
        if self._cipher is not None:
            datos = self._cipher.seal(datos, self._tipo, entidad.tenant_id, entidad.id)  # type: ignore[attr-defined]
        with psycopg.connect(self._url) as c:
            c.execute(
                "INSERT INTO registros (tipo, tenant_id, id, datos, creado) VALUES (%s, %s, %s, %s::jsonb, %s) "
                "ON CONFLICT (tipo, tenant_id, id) DO UPDATE SET datos = EXCLUDED.datos",
                (self._tipo, entidad.tenant_id, entidad.id, datos, entidad.creado),  # type: ignore[attr-defined]
            )

    def por_id(self, tenant_id: str, entidad_id: str) -> T | None:
        with psycopg.connect(self._url) as c:
            fila = c.execute(
                "SELECT datos::text FROM registros WHERE tipo = %s AND tenant_id = %s AND id = %s",
                (self._tipo, tenant_id, entidad_id),
            ).fetchone()
        return self._read(tenant_id, entidad_id, fila[0]) if fila else None

    def listar(self, tenant_id: str) -> list[T]:
        with psycopg.connect(self._url) as c:
            filas = c.execute(
                "SELECT id, datos::text FROM registros WHERE tipo = %s AND tenant_id = %s ORDER BY creado DESC",
                (self._tipo, tenant_id),
            ).fetchall()
        return [self._read(tenant_id, record_id, data) for record_id, data in filas]

    def eliminar(self, tenant_id: str, entidad_id: str) -> None:
        with psycopg.connect(self._url) as c:
            c.execute(
                "DELETE FROM registros WHERE tipo = %s AND tenant_id = %s AND id = %s",
                (self._tipo, tenant_id, entidad_id),
            )
