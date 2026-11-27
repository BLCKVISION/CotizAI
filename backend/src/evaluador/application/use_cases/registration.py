"""Self-service sign-up. Each account gets its own organisation, so it can never see anyone else's data."""

from __future__ import annotations

import threading
from collections.abc import Callable

from evaluador.application.ports.salida import (
    Auditoria,
    GeneradorDeIds,
    HasheadorDeContrasenas,
    TenantRepositorio,
    UsuarioRepositorio,
)
from evaluador.domain.errores import SinPermiso
from evaluador.domain.identidad import Rol, Tenant, Usuario
from evaluador.domain.passwords import require_strong_password

SELF_SERVICE_PREFIX = "account-"


class RegisterAccount:
    def __init__(
        self,
        *,
        tenants: TenantRepositorio,
        users: UsuarioRepositorio,
        hasher: HasheadorDeContrasenas,
        ids: GeneradorDeIds,
        audit: Auditoria,
        count_accounts: Callable[[], int],
        enabled: bool = True,
        max_accounts: int = 25,
    ) -> None:
        self._tenants, self._users, self._hasher = tenants, users, hasher
        self._ids, self._audit, self._count = ids, audit, count_accounts
        self._enabled, self._max = enabled, max_accounts
        self._lock = threading.Lock()  # two sign-ups with the same address must not both succeed

    def execute(self, display_name: str, email: str, password: str) -> None:
        """Gives no sign of whether the address already had an account."""
        if not self._enabled:
            raise SinPermiso("El registro de cuentas está desactivado. Pida acceso al administrador.")
        email = email.strip().lower()
        require_strong_password(password, email)
        password_hash = self._hasher.hashear(password)  # always, so both outcomes take the same time
        with self._lock:
            if self._count() >= self._max:
                raise SinPermiso("No se admiten más cuentas nuevas. Pida acceso al administrador.")
            if self._users.por_correo(email) is not None:
                self._audit.registrar(tenant_id=None, actor=None, accion="registration_ignored", detalle="existing")
                return
            tenant_id = self._ids.nuevo()
            name = " ".join(display_name.split())
            self._tenants.guardar(Tenant(tenant_id, f"{SELF_SERVICE_PREFIX}{tenant_id}", f"Organización de {name}"))
            user = Usuario(
                id=self._ids.nuevo(),
                tenant_id=tenant_id,
                correo=email,
                hash_contrasena=password_hash,
                rol=Rol.COORDINADOR,  # runs a whole purchase; awarding stays with an approver
                display_name=name,
            )
            self._users.guardar(user)
        self._audit.registrar(tenant_id=tenant_id, actor=user.id, accion="account_registered", detalle=user.id)
