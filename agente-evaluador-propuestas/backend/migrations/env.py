"""Entorno de Alembic. Sin `fileConfig`: no se pisa el log JSON de la aplicación."""

from __future__ import annotations

import os

from alembic import context
from sqlalchemy import create_engine, pool

from evaluador.adapters.outbound.persistence.sql.factory import normalize_url
from evaluador.adapters.outbound.persistence.sql.models import metadata

config = context.config


def _url() -> str:
    url = config.get_main_option("sqlalchemy.url") or os.environ.get("EVALUADOR_DATABASE_URL", "")
    if not url:
        raise RuntimeError("Defina EVALUADOR_DATABASE_URL (o sqlalchemy.url) para migrar.")
    return normalize_url(url)


def run_migrations_offline() -> None:
    context.configure(url=_url(), target_metadata=metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(_url(), poolclass=pool.NullPool)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=metadata)
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
