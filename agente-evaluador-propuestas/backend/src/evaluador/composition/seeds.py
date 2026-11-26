"""Datos demo para desarrollo/demostración. Las contraseñas vienen del entorno; nunca viven en el repositorio."""

from __future__ import annotations

from evaluador.composition.container import Container
from evaluador.domain.identity import Role, Tenant, User


def seed_demo(
    c: Container,
    key_by_role: str | None,
    extra_account: tuple[str, str] | None = None,
    tenant_code: str = "demo",
) -> None:
    """Crea el tenant demo, un usuario por rol (si hay clave) y, opcionalmente, una cuenta extra (correo, clave)."""
    tenant = Tenant(id=c.ids.new(), code=tenant_code, name="Organización demo")
    c.tenants.save(tenant)
    if key_by_role:
        h = c.hasher.hash(key_by_role)
        for role in Role:
            c.users.save(
                User(id=c.ids.new(), tenant_id=tenant.id, email=f"{role}@demo.local", password_hash=h, role=role)
            )
    if extra_account:
        email, key = extra_account
        c.users.save(
            User(
                id=c.ids.new(),
                tenant_id=tenant.id,
                email=email.strip().lower(),
                password_hash=c.hasher.hash(key),
                role=Role.LOADER,
            )
        )
