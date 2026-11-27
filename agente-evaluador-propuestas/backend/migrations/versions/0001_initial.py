"""Esquema inicial: identidad, proyectos, tasas, flujo de evaluación, auditoría encadenada, proveedores y revisiones.

Revision ID: 0001
Revises:
"""

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

_TS = sa.DateTime(timezone=True)


def _tenant() -> sa.Column:
    return sa.Column("tenant_id", sa.String(64), nullable=False)


def upgrade() -> None:
    op.create_table(
        "tenants",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("code", sa.String(120), nullable=False, unique=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("active", sa.Boolean, nullable=False),
    )
    op.create_table(
        "users",
        sa.Column("id", sa.String(64), primary_key=True),
        _tenant(),
        sa.Column("email", sa.String(254), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", sa.String(32), nullable=False),
        sa.Column("active", sa.Boolean, nullable=False),
        sa.Column("failed_attempts", sa.Integer, nullable=False),
        sa.Column("blocked_until", _TS, nullable=True),
    )
    op.create_index("ix_users_tenant_id", "users", ["tenant_id"])
    op.create_table(
        "sessions",
        sa.Column("id", sa.String(64), primary_key=True),
        _tenant(),
        sa.Column("user_id", sa.String(64), nullable=False),
        sa.Column("token_hash", sa.String(128), nullable=False, unique=True),
        sa.Column("created", _TS, nullable=False),
        sa.Column("expires", _TS, nullable=False),
        sa.Column("last_activity", _TS, nullable=False),
        sa.Column("revoked", sa.Boolean, nullable=False),
    )
    op.create_index("ix_sessions_tenant_id", "sessions", ["tenant_id"])
    op.create_table(
        "projects",
        sa.Column("id", sa.String(64), primary_key=True),
        _tenant(),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("requirement", sa.Text, nullable=False),
        sa.Column("location", sa.String(200), nullable=False),
        sa.Column("reference_budget", sa.String(64), nullable=True),
        sa.Column("state", sa.String(32), nullable=False),
        sa.Column("created_by", sa.String(64), nullable=False),
        sa.Column("created", _TS, nullable=False),
        sa.Column("closing_reason", sa.Text, nullable=True),
    )
    op.create_index("ix_projects_tenant_id", "projects", ["tenant_id"])
    op.create_table(
        "exchange_rates",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        _tenant(),
        sa.Column("base", sa.String(3), nullable=False),
        sa.Column("quote", sa.String(3), nullable=False),
        sa.Column("value", sa.String(64), nullable=False),
        sa.Column("source", sa.String(200), nullable=False),
        sa.Column("effective_date", sa.Date, nullable=False),
        sa.Column("origin", sa.String(16), nullable=False),
        sa.UniqueConstraint("tenant_id", "base", "quote", "effective_date", "origin", name="uq_exchange_rates_key"),
    )
    op.create_table(
        "proposals",
        sa.Column("id", sa.String(64), primary_key=True),
        _tenant(),
        sa.Column("project_id", sa.String(64), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("size_bytes", sa.BigInteger, nullable=False),
        sa.Column("storage_key", sa.String(255), nullable=False),
        sa.Column("uploaded_by", sa.String(64), nullable=False),
        sa.Column("created", _TS, nullable=False),
    )
    op.create_index("ix_proposals_tenant_project", "proposals", ["tenant_id", "project_id"])
    op.create_table(
        "jobs",
        sa.Column("id", sa.String(64), primary_key=True),
        _tenant(),
        sa.Column("project_id", sa.String(64), nullable=False),
        sa.Column("requested_by", sa.String(64), nullable=False),
        sa.Column("created", _TS, nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("attempts", sa.Integer, nullable=False),
        sa.Column("started", _TS, nullable=True),
        sa.Column("finished", _TS, nullable=True),
        sa.Column("error", sa.Text, nullable=True),
    )
    op.create_index("ix_jobs_tenant_project", "jobs", ["tenant_id", "project_id"])
    op.create_index("ix_jobs_status_created", "jobs", ["status", "created"])
    op.create_table(
        "job_events",
        _tenant(),
        sa.Column("job_id", sa.String(64), nullable=False),
        sa.Column("seq", sa.Integer, nullable=False),
        sa.Column("at", _TS, nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("message", sa.Text, nullable=False),
        sa.PrimaryKeyConstraint("tenant_id", "job_id", "seq"),
    )
    op.create_table(
        "results",
        sa.Column("job_id", sa.String(64), primary_key=True),
        _tenant(),
        sa.Column("payload", sa.Text, nullable=False),
    )
    op.create_index("ix_results_tenant_id", "results", ["tenant_id"])
    op.create_table(
        "audit_trail",
        _tenant(),
        sa.Column("seq", sa.Integer, nullable=False),
        sa.Column("at", _TS, nullable=False),
        sa.Column("actor", sa.String(64), nullable=True),
        sa.Column("action", sa.String(120), nullable=False),
        sa.Column("detail", sa.Text, nullable=False),
        sa.Column("prev_hash", sa.String(64), nullable=False),
        sa.Column("hash", sa.String(64), nullable=False),
        sa.PrimaryKeyConstraint("tenant_id", "seq"),
    )
    op.create_table(
        "suppliers",
        sa.Column("id", sa.String(64), primary_key=True),
        _tenant(),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("rif", sa.String(32), nullable=True),
        sa.Column("location", sa.String(200), nullable=True),
        sa.Column("contact", sa.String(200), nullable=True),
        sa.UniqueConstraint("tenant_id", "rif", name="uq_suppliers_tenant_rif"),
    )
    op.create_index("ix_suppliers_tenant_name", "suppliers", ["tenant_id", "name"])
    op.create_table(
        "supplier_records",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        _tenant(),
        sa.Column("supplier_id", sa.String(64), nullable=False),
        sa.Column("job_id", sa.String(64), nullable=False),
        sa.Column("project_id", sa.String(64), nullable=False),
        sa.Column("proposal_id", sa.String(255), nullable=False),
        sa.Column("verdict", sa.String(32), nullable=False),
        sa.Column("reason", sa.Text, nullable=False),
        sa.Column("at", _TS, nullable=False),
    )
    op.create_index("ix_supplier_records_tenant_supplier", "supplier_records", ["tenant_id", "supplier_id"])
    op.create_table(
        "reviews",
        sa.Column("id", sa.String(64), primary_key=True),
        _tenant(),
        sa.Column("job_id", sa.String(64), nullable=False),
        sa.Column("proposal_id", sa.String(255), nullable=True),
        sa.Column("author_id", sa.String(64), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("text", sa.Text, nullable=False),
        sa.Column("created", _TS, nullable=False),
        sa.Column("payload", sa.Text, nullable=True),
    )
    op.create_index("ix_reviews_tenant_job", "reviews", ["tenant_id", "job_id"])


def downgrade() -> None:
    for table in (
        "reviews", "supplier_records", "suppliers", "audit_trail", "results", "job_events", "jobs",
        "proposals", "exchange_rates", "projects", "sessions", "users", "tenants",
    ):  # fmt: skip
        op.drop_table(table)
