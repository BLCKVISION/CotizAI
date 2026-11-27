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
    """Seeding again keeps what happened to the account: its access, its role and its lockout.

    A new role in the server settings still applies.
    """
    seeded = replace(user, seed_role=user.rol.value)
    stored = c.usuarios.por_id(user.tenant_id, user.id)
    if stored is None:
        return seeded
    setting_changed = stored.seed_role not in ("", seeded.seed_role)
    return replace(
        seeded,
        rol=seeded.rol if setting_changed else stored.rol,
        activo=True if stored.disabled_by_seed else stored.activo,
        intentos_fallidos=stored.intentos_fallidos,
        bloqueado_hasta=stored.bloqueado_hasta,
    )


def apply_demo_settings(
    c: Contenedor,
    password_per_role: str | None,
    extra_account: tuple[str, str] | None,
    tenant_code: str = "demo",
    extra_display_name: str = "",
    extra_role: str = Rol.CARGADOR,
) -> None:
    """Seeds what the settings ask for and disables the seeded accounts they no longer ask for.

    Accounts are persisted, so skipping the seed alone would leave the old demo access open.
    """
    wanted: set[str] = set()
    if password_per_role or extra_account:
        sembrar_demo(c, password_per_role, extra_account, tenant_code, extra_display_name, extra_role)
    if password_per_role:
        wanted |= {_id_estable(tenant_code, role) for role in Rol}
    if extra_account:
        wanted.add(_id_estable(tenant_code, extra_account[0].strip().lower()))
    by_role = {_id_estable(tenant_code, role) for role in Rol}
    for user in c.usuarios.of_tenant(_id_estable(tenant_code)):
        # Seeded ids are derived from the role or the address; people added by the team have random ids.
        seeded = user.id in by_role or user.id == _id_estable(tenant_code, user.correo)
        if seeded and user.id not in wanted and user.activo:
            c.usuarios.guardar(replace(user, activo=False, disabled_by_seed=True))


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
