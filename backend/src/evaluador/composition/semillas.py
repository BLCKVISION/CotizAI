"""Datos demo para desarrollo/demostración. Las contraseñas vienen del entorno; nunca viven en el repositorio."""

from __future__ import annotations

import uuid
from dataclasses import replace

from evaluador.composition.contenedor import Contenedor
from evaluador.domain.identidad import Rol, Tenant, Usuario


def _id_estable(*partes: str) -> str:
    """Los usuarios se recrean en cada arranque; un id fijo conserva la propiedad de los datos guardados."""
    return str(uuid.uuid5(uuid.NAMESPACE_URL, "cotizai:" + ":".join(partes)))


def _keeping_access(c: Contenedor, user: Usuario) -> Usuario:
    """An account the team disabled stays disabled when the server restarts and seeds it again."""
    stored = c.usuarios.por_id(user.tenant_id, user.id)
    return user if stored is None else replace(user, activo=stored.activo)


def sembrar_demo(
    c: Contenedor,
    clave_por_rol: str | None,
    cuenta_extra: tuple[str, str] | None = None,
    codigo_tenant: str = "demo",
    extra_display_name: str = "",
    extra_role: str = Rol.CARGADOR,
) -> None:
    """Crea el tenant demo, un usuario por rol (si hay clave) y, opcionalmente, una cuenta extra (correo, clave)."""
    tenant = Tenant(id=_id_estable(codigo_tenant), codigo=codigo_tenant, nombre="Organización demo")
    c.tenants.guardar(tenant)
    if clave_por_rol:
        h = c.hasheador.hashear(clave_por_rol)
        for rol in Rol:
            seeded = Usuario(
                id=_id_estable(codigo_tenant, rol),
                tenant_id=tenant.id,
                correo=f"{rol}@demo.local",
                hash_contrasena=h,
                rol=rol,
            )
            c.usuarios.guardar(_keeping_access(c, seeded))
    if cuenta_extra:
        correo, clave = cuenta_extra
        account = Usuario(
            id=_id_estable(codigo_tenant, correo.strip().lower()),
            tenant_id=tenant.id,
            correo=correo.strip().lower(),
            hash_contrasena=c.hasheador.hashear(clave),
            rol=Rol(extra_role),
            display_name=extra_display_name.strip(),
        )
        c.usuarios.guardar(_keeping_access(c, account))
