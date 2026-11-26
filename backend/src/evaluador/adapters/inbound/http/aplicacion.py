"""Fábrica de la aplicación FastAPI: arma interceptores, manejadores de error y rutas."""

from __future__ import annotations

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from evaluador.adapters.inbound.http.errores_http import registrar_manejadores
from evaluador.adapters.inbound.http.guards import LimitadorDeVentana
from evaluador.adapters.inbound.http.interceptores import InterceptorDeSeguridad, InterceptorDeTrazabilidad
from evaluador.adapters.inbound.http.routers import gestion, proyectos, sesiones
from evaluador.composition.configuracion import Configuracion
from evaluador.composition.contenedor import Contenedor, construir_contenedor
from evaluador.composition.semillas import sembrar_demo
from evaluador.observabilidad.registro import configurar_logs


def crear_aplicacion(config: Configuracion | None = None, contenedor: Contenedor | None = None) -> FastAPI:
    config = config or Configuracion()
    configurar_logs(config.nivel_de_log)

    app = FastAPI(
        title="Agente Evaluador de Propuestas",
        version="1.0.0",
        docs_url=None if config.es_produccion else "/api/docs",
        redoc_url=None,
        openapi_url=None if config.es_produccion else "/api/openapi.json",
    )
    app.state.contenedor = contenedor or construir_contenedor(config=config)
    hay_semilla = bool(config.semilla_clave or (config.usuario_demo_correo and config.usuario_demo_clave))
    if hay_semilla and (not config.es_produccion or config.permitir_semilla_en_produccion):
        cuenta = (
            (config.usuario_demo_correo, config.usuario_demo_clave.get_secret_value())
            if config.usuario_demo_correo and config.usuario_demo_clave
            else None
        )
        sembrar_demo(
            app.state.contenedor,
            config.semilla_clave.get_secret_value() if config.semilla_clave else None,
            cuenta,
            extra_display_name=config.demo_display_name,
        )
    app.state.produccion = config.es_produccion
    app.state.limitador_login = LimitadorDeVentana(config.limite_login_por_minuto)

    api = APIRouter(prefix="/api/v1")
    api.include_router(sesiones.router)
    api.include_router(proyectos.router)
    api.include_router(gestion.router)

    @api.get("/salud", tags=["sistema"])
    def salud() -> dict[str, str]:
        return {"estado": "ok"}

    app.include_router(api)
    registrar_manejadores(app)

    # El último añadido es el más externo: trazabilidad envuelve todo (incluido CORS y errores).
    if config.origenes_cors:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=config.origenes_cors,
            allow_methods=["GET", "POST", "DELETE"],
            allow_headers=["Authorization", "Content-Type", "X-Track-Id"],
            expose_headers=["X-Track-Id"],
            max_age=600,
        )
    app.add_middleware(InterceptorDeSeguridad, produccion=config.es_produccion)
    app.add_middleware(
        InterceptorDeTrazabilidad,
        confiar_en_proxy=config.confiar_en_proxy,
        max_bytes=config.max_bytes_payload,
        produccion=config.es_produccion,
    )
    return app
