"""Punto de entrada ASGI: uvicorn evaluador.adapters.inbound.http.main:app"""

from evaluador.adapters.inbound.http.app import create_app

app = create_app()
