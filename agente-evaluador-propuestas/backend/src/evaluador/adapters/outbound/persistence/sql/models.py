"""Esquema SQL (SQLAlchemy Core) con tipos portables entre SQLite (pruebas) y PostgreSQL.

- Fechas: siempre UTC con zona. SQLite no guarda zona; `UtcDateTime` la restituye al leer.
- Decimales: texto, sin pérdida (NUMERIC en SQLite pasaría por float). Se ordenan en código, no en SQL.
- Aislamiento multi-tenant: toda tabla de negocio lleva `tenant_id` indexado; solo `tenants` no lo lleva.
La migración 0001 declara el mismo esquema a mano: las migraciones no dependen de este archivo.
"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

import sqlalchemy as sa
from sqlalchemy.engine import Dialect

metadata = sa.MetaData()


class UtcDateTime(sa.types.TypeDecorator[datetime]):
    impl = sa.DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError("Las fechas deben llevar zona horaria.")
        return value.astimezone(UTC)

    def process_result_value(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        if value is None:
            return None
        return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


class DecimalText(sa.types.TypeDecorator[Decimal]):
    impl = sa.String(64)
    cache_ok = True

    def process_bind_param(self, value: Decimal | None, dialect: Dialect) -> str | None:
        return None if value is None else format(value, "f")

    def process_result_value(self, value: Any, dialect: Dialect) -> Decimal | None:
        return None if value is None else Decimal(value)


def _id() -> sa.Column[str]:
    return sa.Column("id", sa.String(64), primary_key=True)


def _tenant() -> sa.Column[str]:
    return sa.Column("tenant_id", sa.String(64), nullable=False)


tenants = sa.Table(
    "tenants", metadata,
    _id(),
    sa.Column("code", sa.String(120), nullable=False, unique=True),
    sa.Column("name", sa.String(200), nullable=False),
    sa.Column("active", sa.Boolean, nullable=False),
)  # fmt: skip

users = sa.Table(
    "users", metadata,
    _id(), _tenant(),
    sa.Column("email", sa.String(254), nullable=False, unique=True),  # único en todo el sistema: define el tenant
    sa.Column("password_hash", sa.String(255), nullable=False),
    sa.Column("role", sa.String(32), nullable=False),
    sa.Column("active", sa.Boolean, nullable=False),
    sa.Column("failed_attempts", sa.Integer, nullable=False),
    sa.Column("blocked_until", UtcDateTime, nullable=True),
    sa.Index("ix_users_tenant_id", "tenant_id"),
)  # fmt: skip

sessions = sa.Table(
    "sessions", metadata,
    _id(), _tenant(),
    sa.Column("user_id", sa.String(64), nullable=False),
    sa.Column("token_hash", sa.String(128), nullable=False, unique=True),  # solo la huella, nunca el token
    sa.Column("created", UtcDateTime, nullable=False),
    sa.Column("expires", UtcDateTime, nullable=False),
    sa.Column("last_activity", UtcDateTime, nullable=False),
    sa.Column("revoked", sa.Boolean, nullable=False),
    sa.Index("ix_sessions_tenant_id", "tenant_id"),
)  # fmt: skip

projects = sa.Table(
    "projects", metadata,
    _id(), _tenant(),
    sa.Column("name", sa.String(200), nullable=False),
    sa.Column("requirement", sa.Text, nullable=False),
    sa.Column("location", sa.String(200), nullable=False),
    sa.Column("reference_budget", DecimalText, nullable=True),
    sa.Column("state", sa.String(32), nullable=False),
    sa.Column("created_by", sa.String(64), nullable=False),
    sa.Column("created", UtcDateTime, nullable=False),
    sa.Column("closing_reason", sa.Text, nullable=True),
    sa.Index("ix_projects_tenant_id", "tenant_id"),
)  # fmt: skip

exchange_rates = sa.Table(
    "exchange_rates", metadata,
    sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
    _tenant(),
    sa.Column("base", sa.String(3), nullable=False),
    sa.Column("quote", sa.String(3), nullable=False),
    sa.Column("value", DecimalText, nullable=False),
    sa.Column("source", sa.String(200), nullable=False),
    sa.Column("effective_date", sa.Date, nullable=False),
    sa.Column("origin", sa.String(16), nullable=False),
    sa.UniqueConstraint("tenant_id", "base", "quote", "effective_date", "origin", name="uq_exchange_rates_key"),
)  # fmt: skip

proposals = sa.Table(
    "proposals", metadata,
    _id(), _tenant(),
    sa.Column("project_id", sa.String(64), nullable=False),
    sa.Column("filename", sa.String(255), nullable=False),
    sa.Column("sha256", sa.String(64), nullable=False),
    sa.Column("size_bytes", sa.BigInteger, nullable=False),
    sa.Column("storage_key", sa.String(255), nullable=False),
    sa.Column("uploaded_by", sa.String(64), nullable=False),
    sa.Column("created", UtcDateTime, nullable=False),
    sa.Index("ix_proposals_tenant_project", "tenant_id", "project_id"),
)  # fmt: skip

jobs = sa.Table(
    "jobs", metadata,
    _id(), _tenant(),
    sa.Column("project_id", sa.String(64), nullable=False),
    sa.Column("requested_by", sa.String(64), nullable=False),
    sa.Column("created", UtcDateTime, nullable=False),
    sa.Column("status", sa.String(16), nullable=False),
    sa.Column("attempts", sa.Integer, nullable=False),
    sa.Column("started", UtcDateTime, nullable=True),
    sa.Column("finished", UtcDateTime, nullable=True),
    sa.Column("error", sa.Text, nullable=True),
    sa.Index("ix_jobs_tenant_project", "tenant_id", "project_id"),
    sa.Index("ix_jobs_status_created", "status", "created"),  # cola: el más antiguo en `queued`
)  # fmt: skip

job_events = sa.Table(
    "job_events", metadata,
    _tenant(),
    sa.Column("job_id", sa.String(64), nullable=False),
    sa.Column("seq", sa.Integer, nullable=False),
    sa.Column("at", UtcDateTime, nullable=False),
    sa.Column("kind", sa.String(16), nullable=False),
    sa.Column("message", sa.Text, nullable=False),
    sa.PrimaryKeyConstraint("tenant_id", "job_id", "seq"),
)  # fmt: skip

results = sa.Table(
    "results", metadata,
    sa.Column("job_id", sa.String(64), primary_key=True),
    _tenant(),
    sa.Column("payload", sa.Text, nullable=False),  # JSON del ResultOut
    sa.Index("ix_results_tenant_id", "tenant_id"),
)  # fmt: skip

audit_trail = sa.Table(
    "audit_trail", metadata,
    _tenant(),
    sa.Column("seq", sa.Integer, nullable=False),
    sa.Column("at", UtcDateTime, nullable=False),
    sa.Column("actor", sa.String(64), nullable=True),
    sa.Column("action", sa.String(120), nullable=False),
    sa.Column("detail", sa.Text, nullable=False),
    sa.Column("prev_hash", sa.String(64), nullable=False),
    sa.Column("hash", sa.String(64), nullable=False),
    sa.PrimaryKeyConstraint("tenant_id", "seq"),
)  # fmt: skip

suppliers = sa.Table(
    "suppliers", metadata,
    _id(), _tenant(),
    sa.Column("name", sa.String(200), nullable=False),
    sa.Column("rif", sa.String(32), nullable=True),
    sa.Column("location", sa.String(200), nullable=True),
    sa.Column("contact", sa.String(200), nullable=True),
    sa.Index("ix_suppliers_tenant_name", "tenant_id", "name"),
    sa.UniqueConstraint("tenant_id", "rif", name="uq_suppliers_tenant_rif"),  # NULL no choca: sin RIF puede repetirse
)  # fmt: skip

supplier_records = sa.Table(
    "supplier_records", metadata,
    sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
    _tenant(),
    sa.Column("supplier_id", sa.String(64), nullable=False),
    sa.Column("job_id", sa.String(64), nullable=False),
    sa.Column("project_id", sa.String(64), nullable=False),
    sa.Column("proposal_id", sa.String(255), nullable=False),
    sa.Column("verdict", sa.String(32), nullable=False),
    sa.Column("reason", sa.Text, nullable=False),
    sa.Column("at", UtcDateTime, nullable=False),
    sa.Index("ix_supplier_records_tenant_supplier", "tenant_id", "supplier_id"),
)  # fmt: skip

reviews = sa.Table(
    "reviews", metadata,
    _id(), _tenant(),
    sa.Column("job_id", sa.String(64), nullable=False),
    sa.Column("proposal_id", sa.String(255), nullable=True),
    sa.Column("author_id", sa.String(64), nullable=False),
    sa.Column("kind", sa.String(16), nullable=False),
    sa.Column("text", sa.Text, nullable=False),
    sa.Column("created", UtcDateTime, nullable=False),
    sa.Column("payload", sa.Text, nullable=True),  # JSON {str: str}
    sa.Index("ix_reviews_tenant_job", "tenant_id", "job_id"),
)  # fmt: skip
