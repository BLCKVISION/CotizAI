"""Censura de datos sensibles antes de que lleguen a un log. Lista de bloqueo por nombre de campo."""

from __future__ import annotations

import re
from typing import Any

CENSURADO = "***"
_CLAVES_SENSIBLES = (
    "contrasena", "contraseña", "password", "passwd", "clave", "secret", "secreto",
    "token", "authorization", "cookie", "api_key", "apikey", "hash", "otp", "pin",
    "rif", "tarjeta", "card", "cvv", "iban",
)  # fmt: skip
_CLAVES_CORREO = ("correo", "email", "e-mail")
_BEARER = re.compile(r"(?i)\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]+")
_MAX_PROFUNDIDAD = 6
_MAX_ITEMS = 50
_MAX_TEXTO = 300


def _es_sensible(clave: str) -> bool:
    k = clave.lower()
    return any(s in k for s in _CLAVES_SENSIBLES)


def _es_correo(clave: str) -> bool:
    k = clave.lower()
    return any(s in k for s in _CLAVES_CORREO)


def enmascarar_correo(valor: str) -> str:
    local, _, dominio = valor.partition("@")
    if not dominio:
        return CENSURADO
    return f"{local[:1]}***@{dominio}"


def censurar_texto(texto: str) -> str:
    texto = _BEARER.sub(lambda m: f"{m.group(1)} {CENSURADO}", texto)
    return texto if len(texto) <= _MAX_TEXTO else texto[:_MAX_TEXTO] + "…"


def censurar(valor: Any, clave: str = "", profundidad: int = 0) -> Any:
    """Devuelve una copia segura para loguear; nunca modifica el original."""
    if clave and _es_sensible(clave):
        return CENSURADO
    if profundidad >= _MAX_PROFUNDIDAD:
        return "…"
    if isinstance(valor, dict):
        return {str(k): censurar(v, str(k), profundidad + 1) for k, v in list(valor.items())[:_MAX_ITEMS]}
    if isinstance(valor, (list, tuple, set)):
        return [censurar(v, clave, profundidad + 1) for v in list(valor)[:_MAX_ITEMS]]
    if isinstance(valor, str):
        if clave and _es_correo(clave):
            return enmascarar_correo(valor)
        return censurar_texto(valor)
    if isinstance(valor, (int, float, bool)) or valor is None:
        return valor
    return censurar_texto(str(valor))


def censurar_cabeceras(cabeceras: dict[str, str]) -> dict[str, str]:
    return {k: (CENSURADO if _es_sensible(k) else censurar_texto(v)) for k, v in cabeceras.items()}
