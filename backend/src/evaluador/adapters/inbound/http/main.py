"""Punto de entrada ASGI: uvicorn evaluador.adapters.inbound.http.main:app"""

from evaluador.adapters.inbound.http.aplicacion import crear_aplicacion

app = crear_aplicacion()
