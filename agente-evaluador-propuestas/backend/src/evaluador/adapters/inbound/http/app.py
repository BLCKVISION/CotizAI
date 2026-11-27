"""Fábrica de la aplicación FastAPI: arma interceptores, manejadores de error y rutas."""

from __future__ import annotations

import logging

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from evaluador.adapters.inbound.http.guards import WindowLimiter
from evaluador.adapters.inbound.http.http_errors import register_handlers
from evaluador.adapters.inbound.http.interceptors import SecurityInterceptor, TraceabilityInterceptor
from evaluador.adapters.inbound.http.routers import projects, sessions, transcriptions
from evaluador.adapters.outbound.ai.factory import create_model
from evaluador.application.ports.agent import VisionModel
from evaluador.composition.container import Container, build_container
from evaluador.composition.seeds import seed_demo
from evaluador.composition.settings import Settings
from evaluador.observability.log import configure_logs

_log = logging.getLogger("evaluador.app")
_LARGE_BODY_PATHS = ("/api/v1/transcriptions",)  # reciben archivos: tienen su propio tope, no el de 1 MiB de JSON


def _vision_model(config: Settings) -> VisionModel | None:
    """El modelo configurado, si sabe leer imágenes. Sin él la app arranca igual y transcribir responde 503."""
    try:
        model = create_model(config)
    except Exception as exc:  # noqa: BLE001 - un proveedor mal configurado no debe impedir arrancar la API
        _log.warning("vision_model_unavailable", extra={"type": type(exc).__name__})
        return None
    return model if hasattr(model, "structure_image") else None  # type: ignore[return-value]


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
    app.state.container = container or build_container(vision=_vision_model(config))
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
