"""Accounts kept in PostgreSQL, so people who sign up still exist after a restart.

They are read once at start-up and written through: the API runs as a single process.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from evaluador.adapters.outbound.memory.repositorios import TenantsEnMemoria, UsuariosEnMemoria
from evaluador.adapters.outbound.persistence.coleccion_postgres import ColeccionPostgres
from evaluador.domain.identidad import Tenant, Usuario

SYSTEM = "system"  # accounts are read before knowing their organisation


@dataclass(frozen=True, slots=True)
class TenantRecord:
    id: str
    tenant_id: str
    creado: datetime
    tenant: Tenant


@dataclass(frozen=True, slots=True)
class UserRecord:
    id: str
    tenant_id: str
    creado: datetime
    user: Usuario


class PersistentTenants(TenantsEnMemoria):
    def __init__(self, records: ColeccionPostgres[TenantRecord]) -> None:
        super().__init__()
        self._records = records
        for record in records.listar(SYSTEM):
            super().guardar(record.tenant)

    def guardar(self, tenant: Tenant) -> None:
        super().guardar(tenant)
        self._records.guardar(TenantRecord(tenant.id, SYSTEM, datetime.now(UTC), tenant))


class PersistentUsers(UsuariosEnMemoria):
    def __init__(self, records: ColeccionPostgres[UserRecord]) -> None:
        super().__init__()
        self._records = records
        for record in records.listar(SYSTEM):
            super().guardar(record.user)

    def guardar(self, usuario: Usuario) -> None:
        super().guardar(usuario)  # raises first if the address belongs to someone else
        self._records.guardar(UserRecord(usuario.id, SYSTEM, datetime.now(UTC), usuario))
