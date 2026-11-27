"""Fábrica de repositorios SQL y ejecución de migraciones. Acepta SQLite (pruebas) y PostgreSQL (psycopg 3)."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import Engine, create_engine, event

from .repositories import (
    SqlAuditTrail,
    SqlExchangeRates,
    SqlJobEvents,
    SqlJobs,
    SqlProjects,
    SqlProposals,
    SqlResults,
    SqlReviews,
    SqlSessions,
    SqlSuppliers,
    SqlTenants,
    SqlUsers,
)

_BACKEND_DIR = Path(__file__).resolve().parents[6]  # backend/ (alembic.ini y migrations/ viven ahí)


def normalize_url(url: str) -> str:
    """`postgresql://` y `postgres://` usan el driver psycopg 3 de este proyecto."""
    for prefix in ("postgresql://", "postgres://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix) :]
    return url


def _make_engine(url: str) -> Engine:
    url = normalize_url(url)
    if not url.startswith("sqlite"):
        return create_engine(url, pool_pre_ping=True)
    engine = create_engine(url, connect_args={"check_same_thread": False, "timeout": 30})

    @event.listens_for(engine, "connect")
    def _no_autobegin(dbapi_conn, _record):  # type: ignore[no-untyped-def]
        dbapi_conn.isolation_level = None  # control manual de transacciones (receta de SQLAlchemy para pysqlite)

    @event.listens_for(engine, "begin")
    def _begin_immediate(conn):  # type: ignore[no-untyped-def]
        conn.exec_driver_sql("BEGIN IMMEDIATE")  # serializa escrituras: sin «database is locked» al subir de lectura

    return engine


@dataclass(frozen=True, slots=True)
class SqlRepositories:
    engine: Engine
    tenants: SqlTenants
    users: SqlUsers
    sessions: SqlSessions
    projects: SqlProjects
    exchange_rates: SqlExchangeRates
    proposals: SqlProposals
    jobs: SqlJobs
    job_events: SqlJobEvents
    results: SqlResults
    audit_trail: SqlAuditTrail
    suppliers: SqlSuppliers
    reviews: SqlReviews

    def dispose(self) -> None:
        self.engine.dispose()


def build_sql_repositories(database_url: str) -> SqlRepositories:
    """Crea los repositorios sobre un único motor. No crea el esquema: eso lo hace `run_migrations`."""
    e = _make_engine(database_url)
    return SqlRepositories(
        engine=e, tenants=SqlTenants(e), users=SqlUsers(e), sessions=SqlSessions(e), projects=SqlProjects(e),
        exchange_rates=SqlExchangeRates(e), proposals=SqlProposals(e), jobs=SqlJobs(e), job_events=SqlJobEvents(e),
        results=SqlResults(e), audit_trail=SqlAuditTrail(e), suppliers=SqlSuppliers(e), reviews=SqlReviews(e),
    )  # fmt: skip


def run_migrations(database_url: str, target: str = "head") -> None:
    """`alembic upgrade <target>` (o `downgrade` si `target` es `base` o una revisión anterior) por código."""
    ini = _BACKEND_DIR / "alembic.ini"
    if not ini.exists():
        raise RuntimeError(f"No se encontró {ini}: las migraciones deben acompañar al backend.")
    cfg = Config(str(ini))
    cfg.set_main_option("script_location", str(_BACKEND_DIR / "migrations"))
    cfg.set_main_option("sqlalchemy.url", normalize_url(database_url).replace("%", "%%"))
    if target == "base":
        command.downgrade(cfg, "base")
    else:
        command.upgrade(cfg, target)
