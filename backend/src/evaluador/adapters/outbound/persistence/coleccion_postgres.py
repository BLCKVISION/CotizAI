"""Colección persistente sobre PostgreSQL (JSONB). Toda consulta filtra por tenant_id."""

from __future__ import annotations

from typing import Generic, TypeVar

import psycopg
from pydantic import TypeAdapter

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


class ColeccionPostgres(Generic[T]):
    def __init__(self, url: str, tipo: str, clase: type[T]) -> None:
        self._url, self._tipo = url, tipo
        self._adaptador: TypeAdapter[T] = TypeAdapter(clase)

    def guardar(self, entidad: T) -> None:
        datos = self._adaptador.dump_json(entidad).decode()
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
        return self._adaptador.validate_json(fila[0]) if fila else None

    def listar(self, tenant_id: str) -> list[T]:
        with psycopg.connect(self._url) as c:
            filas = c.execute(
                "SELECT datos::text FROM registros WHERE tipo = %s AND tenant_id = %s ORDER BY creado DESC",
                (self._tipo, tenant_id),
            ).fetchall()
        return [self._adaptador.validate_json(f[0]) for f in filas]

    def eliminar(self, tenant_id: str, entidad_id: str) -> None:
        with psycopg.connect(self._url) as c:
            c.execute(
                "DELETE FROM registros WHERE tipo = %s AND tenant_id = %s AND id = %s",
                (self._tipo, tenant_id, entidad_id),
            )
