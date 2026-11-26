"""Guards: dependencias que autentican y autorizan antes de que la ruta se ejecute."""

from __future__ import annotations

from collections import defaultdict, deque
from time import monotonic
from typing import Annotated

from fastapi import Depends, HTTPException, Request

from evaluador.application.use_cases.autenticacion import SesionAutenticada
from evaluador.domain.errores import SesionInvalida
from evaluador.domain.identidad import Permiso
from evaluador.observabilidad import contexto


def token_de_cabecera(request: Request) -> str:
    esquema, _, valor = request.headers.get("authorization", "").partition(" ")
    if esquema.lower() != "bearer" or not valor.strip():
        raise SesionInvalida("Sesión inválida o expirada.")
    return valor.strip()


def sesion_actual(request: Request, token: Annotated[str, Depends(token_de_cabecera)]) -> SesionAutenticada:
    """Guard de autenticación: resuelve el token y enriquece el contexto de trazabilidad."""
    sesion = request.app.state.contenedor.autenticar_token.ejecutar(token)
    contexto.enriquecer(sesion_id=sesion.sesion_id, tenant_id=sesion.tenant_id, usuario_id=sesion.usuario.id)
    return sesion


def exigir(permiso: Permiso):
    """Guard de autorización por permiso. Los casos de uso lo vuelven a comprobar (defensa en profundidad)."""

    def _guard(sesion: Annotated[SesionAutenticada, Depends(sesion_actual)]) -> SesionAutenticada:
        sesion.usuario.exigir(permiso)
        return sesion

    return _guard


class LimitadorDeVentana:
    """Límite por clave (ip) en ventana deslizante de 60 s. Suficiente para un solo proceso."""

    def __init__(self, maximo_por_minuto: int) -> None:
        self._maximo = maximo_por_minuto
        self._eventos: dict[str, deque[float]] = defaultdict(deque)

    def verificar(self, clave: str) -> None:
        ahora = monotonic()
        cola = self._eventos[clave]
        while cola and ahora - cola[0] > 60:
            cola.popleft()
        if len(cola) >= self._maximo:
            raise HTTPException(status_code=429, detail="Demasiados intentos.", headers={"Retry-After": "60"})
        cola.append(ahora)


def limitar_login(request: Request) -> None:
    request.app.state.limitador_login.verificar(contexto.obtener().ip)
