"""Fábrica de la aplicación FastAPI: arma interceptores, manejadores de error y rutas."""

from __future__ import annotations

import logging
import re

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from evaluador.adapters.inbound.http.guards import WindowLimiter
from evaluador.adapters.inbound.http.http_errors import register_handlers
from evaluador.adapters.inbound.http.interceptors import SecurityInterceptor, TraceabilityInterceptor
from evaluador.adapters.inbound.http.routers import (
    audit,
    chat,
    evaluations,
    projects,
    proposals,
    reports,
    reviews,
    sessions,
    suppliers,
    transcriptions,
)
from evaluador.adapters.outbound.ai.factory import create_model
from evaluador.application.ports.agent import LanguageModel
from evaluador.composition.container import Container, build_container
from evaluador.composition.seeds import seed_demo
from evaluador.composition.settings import Settings
from evaluador.observability.log import configure_logs

_log = logging.getLogger("evaluador.app")
# Rutas que reciben archivos: tienen su propio tope y no el de 1 MiB de JSON; su cuerpo nunca se copia al log.
_LARGE_BODY_PATHS = (
    re.compile(r"^/api/v1/transcriptions$"),
    re.compile(r"^/api/v1/projects/[0-9a-fA-F-]{36}/proposals$"),
)


def _language_model(config: Settings) -> LanguageModel | None:
    """El modelo configurado. Sin él la app arranca igual: chat, visión y evaluación responden 503, no 500."""
    try:
        return create_model(config)
    except Exception as exc:  # noqa: BLE001 - un proveedor mal configurado no debe impedir arrancar la API
        _log.warning("language_model_unavailable", extra={"type": type(exc).__name__})
        return None


def create_app(config: Settings | None = None, container: Container | None = None) -> FastAPI:
    config = config or Settings()
    configure_logs(config.log_level)

    app = FastAPI(
        title="Agente Evaluador de Propuestas",
        version="1.0.0",
        docs_url=None if config.is_production else "/api/docs",
        redoc_url=None,
        openapi_url=None if config.is_production else "/api/openapi.json",
    )
    if container is None:
        model = _language_model(config)
        vision = model if hasattr(model, "structure_image") else None  # solo algunos modelos leen imágenes
        container = build_container(config=config, vision=vision, model=model)  # type: ignore[arg-type]
    app.state.container = container
    has_seed = bool(config.seed_key or (config.demo_user_email and config.demo_user_password))
    if has_seed and (not config.is_production or config.allow_seed_in_production):
        counts = (
            (config.demo_user_email, config.demo_user_password.get_secret_value())
            if config.demo_user_email and config.demo_user_password
            else None
        )
        seed_demo(
            app.state.container,
            config.seed_key.get_secret_value() if config.seed_key else None,
            counts,
        )
    app.state.production = config.is_production
    app.state.login_limiter = WindowLimiter(config.login_limit_per_minute)

    api = APIRouter(prefix="/api/v1")
    api.include_router(sessions.router)
    api.include_router(projects.router)
    api.include_router(proposals.router)
    api.include_router(evaluations.router)
    api.include_router(reviews.router)
    api.include_router(suppliers.router)
    api.include_router(reports.router)
    api.include_router(chat.router)
    api.include_router(audit.router)
    api.include_router(transcriptions.router)

    @api.get("/health", tags=["system"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(api)
    register_handlers(app)

    # El último añadido es el más externo: trazabilidad envuelve todo (incluido CORS y errores).
    if config.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=config.cors_origins,
            allow_methods=["GET", "POST", "DELETE"],
            allow_headers=["Authorization", "Content-Type", "X-Track-Id"],
            expose_headers=["X-Track-Id"],
            max_age=600,
        )
    app.add_middleware(SecurityInterceptor, production=config.is_production)
    app.add_middleware(
        TraceabilityInterceptor,
        trust_proxy=config.trust_proxy,
        max_bytes=config.max_bytes_payload,
        production=config.is_production,
        large_body_paths=_LARGE_BODY_PATHS,
    )
    return app
