"""Datos demo para desarrollo/demostración. Las contraseñas vienen del entorno; nunca viven en el repositorio."""

from __future__ import annotations

from evaluador.composition.contenedor import Contenedor
from evaluador.domain.identidad import Rol, Tenant, Usuario


def sembrar_demo(
    c: Contenedor,
    clave_por_rol: str | None,
    cuenta_extra: tuple[str, str] | None = None,
    codigo_tenant: str = "demo",
) -> None:
    """Crea el tenant demo, un usuario por rol (si hay clave) y, opcionalmente, una cuenta extra (correo, clave)."""
    tenant = Tenant(id=c.ids.nuevo(), codigo=codigo_tenant, nombre="Organización demo")
    c.tenants.guardar(tenant)
    if clave_por_rol:
        h = c.hasheador.hashear(clave_por_rol)
        for rol in Rol:
            c.usuarios.guardar(
                Usuario(id=c.ids.nuevo(), tenant_id=tenant.id, correo=f"{rol}@demo.local", hash_contrasena=h, rol=rol)
            )
    if cuenta_extra:
        correo, clave = cuenta_extra
        c.usuarios.guardar(
            Usuario(
                id=c.ids.nuevo(),
                tenant_id=tenant.id,
                correo=correo.strip().lower(),
                hash_contrasena=c.hasheador.hashear(clave),
                rol=Rol.CARGADOR,
            )
        )
