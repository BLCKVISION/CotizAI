"""Repositorios en memoria (pruebas y desarrollo). Aíslan por tenant igual que lo hará el adaptador SQL."""

from __future__ import annotations

from evaluador.domain.identidad import Sesion, Tenant, Usuario
from evaluador.domain.proyecto import Proyecto


class TenantsEnMemoria:
    def __init__(self) -> None:
        self._por_codigo: dict[str, Tenant] = {}

    def por_id(self, tenant_id: str) -> Tenant | None:
        return next((t for t in self._por_codigo.values() if t.id == tenant_id), None)

    def por_codigo(self, codigo: str) -> Tenant | None:
        return self._por_codigo.get(codigo)


    def guardar(self, tenant: Tenant) -> None:
        self._por_codigo[tenant.codigo] = tenant


class UsuariosEnMemoria:
    def __init__(self) -> None:
        self._datos: dict[tuple[str, str], Usuario] = {}  # (tenant_id, usuario_id)

    def por_correo(self, correo: str) -> Usuario | None:
        return next((u for u in self._datos.values() if u.correo == correo), None)

    def por_id(self, tenant_id: str, usuario_id: str) -> Usuario | None:
        return self._datos.get((tenant_id, usuario_id))

    def guardar(self, usuario: Usuario) -> None:
        existente = self.por_correo(usuario.correo)
        if existente is not None and existente.id != usuario.id:
            raise ValueError("El correo ya está registrado.")  # unicidad global: define el tenant en el login
        self._datos[(usuario.tenant_id, usuario.id)] = usuario


class SesionesEnMemoria:
    def __init__(self) -> None:
        self._por_huella: dict[str, Sesion] = {}

    def por_token_hash(self, token_hash: str) -> Sesion | None:
        return self._por_huella.get(token_hash)

    def guardar(self, sesion: Sesion) -> None:
        self._por_huella[sesion.token_hash] = sesion


class ProyectosEnMemoria:
    def __init__(self) -> None:
        self._datos: dict[tuple[str, str], Proyecto] = {}

    def guardar(self, proyecto: Proyecto) -> None:
        self._datos[(proyecto.tenant_id, proyecto.id)] = proyecto

    def por_id(self, tenant_id: str, proyecto_id: str) -> Proyecto | None:
        return self._datos.get((tenant_id, proyecto_id))

    def listar(self, tenant_id: str) -> list[Proyecto]:
        return sorted((p for (t, _), p in self._datos.items() if t == tenant_id), key=lambda p: p.creado, reverse=True)
