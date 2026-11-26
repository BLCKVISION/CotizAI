"""Colección en memoria (pruebas). Misma interfaz que la de PostgreSQL; siempre aislada por tenant."""

from __future__ import annotations

from typing import Generic, TypeVar

T = TypeVar("T")


class ColeccionEnMemoria(Generic[T]):
    def __init__(self) -> None:
        self._datos: dict[tuple[str, str], T] = {}

    def guardar(self, entidad: T) -> None:
        self._datos[(entidad.tenant_id, entidad.id)] = entidad  # type: ignore[attr-defined]

    def por_id(self, tenant_id: str, entidad_id: str) -> T | None:
        return self._datos.get((tenant_id, entidad_id))

    def listar(self, tenant_id: str) -> list[T]:
        propias = [e for (t, _), e in self._datos.items() if t == tenant_id]
        return sorted(propias, key=lambda e: e.creado, reverse=True)  # type: ignore[attr-defined]

    def eliminar(self, tenant_id: str, entidad_id: str) -> None:
        self._datos.pop((tenant_id, entidad_id), None)
