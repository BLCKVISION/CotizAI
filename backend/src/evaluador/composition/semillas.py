"""Datos demo para desarrollo/demostración. Las contraseñas vienen del entorno; nunca viven en el repositorio."""

from __future__ import annotations

import uuid

from evaluador.composition.contenedor import Contenedor
from evaluador.domain.identidad import Rol, Tenant, Usuario


def _id_estable(*partes: str) -> str:
    """Los usuarios se recrean en cada arranque; un id fijo conserva la propiedad de los datos guardados."""
    return str(uuid.uuid5(uuid.NAMESPACE_URL, "cotizai:" + ":".join(partes)))


def sembrar_demo(
    c: Contenedor,
    clave_por_rol: str | None,
    cuenta_extra: tuple[str, str] | None = None,
    codigo_tenant: str = "demo",
    extra_display_name: str = "",
) -> None:
    """Crea el tenant demo, un usuario por rol (si hay clave) y, opcionalmente, una cuenta extra (correo, clave)."""
    tenant = Tenant(id=_id_estable(codigo_tenant), codigo=codigo_tenant, nombre="Organización demo")
    c.tenants.guardar(tenant)
    if clave_por_rol:
        h = c.hasheador.hashear(clave_por_rol)
        for rol in Rol:
            c.usuarios.guardar(
                Usuario(
                    id=_id_estable(codigo_tenant, rol),
                    tenant_id=tenant.id,
                    correo=f"{rol}@demo.local",
                    hash_contrasena=h,
                    rol=rol,
                )
            )
    if cuenta_extra:
        correo, clave = cuenta_extra
        c.usuarios.guardar(
            Usuario(
                id=_id_estable(codigo_tenant, correo.strip().lower()),
                tenant_id=tenant.id,
                correo=correo.strip().lower(),
                hash_contrasena=c.hasheador.hashear(clave),
                rol=Rol.CARGADOR,
                display_name=extra_display_name.strip(),
            )
        )
