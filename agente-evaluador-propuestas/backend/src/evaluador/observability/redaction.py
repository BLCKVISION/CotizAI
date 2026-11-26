"""Censura de datos sensibles antes de que lleguen a un log. Lista de bloqueo por nombre de campo."""

from __future__ import annotations

import re
from typing import Any

REDACTED = "***"
_SENSITIVE_KEYS = (
    "contrasena", "contraseña", "password", "passwd", "clave", "secret", "secreto",
    "token", "authorization", "cookie", "api_key", "apikey", "hash", "otp", "pin",
    "rif", "tarjeta", "card", "cvv", "iban",
)  # fmt: skip
_EMAIL_KEYS = ("correo", "email", "e-mail")
_BEARER = re.compile(r"(?i)\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]+")
_MAX_DEPTH = 6
_MAX_ITEMS = 50
_MAX_TEXT = 300


def _is_sensitive(key: str) -> bool:
    k = key.lower()
    return any(s in k for s in _SENSITIVE_KEYS)


def _is_email(key: str) -> bool:
    k = key.lower()
    return any(s in k for s in _EMAIL_KEYS)


def mask_email(value: str) -> str:
    local, _, domain = value.partition("@")
    if not domain:
        return REDACTED
    return f"{local[:1]}***@{domain}"


def redact_text(text: str) -> str:
    text = _BEARER.sub(lambda m: f"{m.group(1)} {REDACTED}", text)
    return text if len(text) <= _MAX_TEXT else text[:_MAX_TEXT] + "…"


def redact(value: Any, key: str = "", depth: int = 0) -> Any:
    """Devuelve una copia segura para loguear; nunca modifica el original."""
    if key and _is_sensitive(key):
        return REDACTED
    if depth >= _MAX_DEPTH:
        return "…"
    if isinstance(value, dict):
        return {str(k): redact(v, str(k), depth + 1) for k, v in list(value.items())[:_MAX_ITEMS]}
    if isinstance(value, (list, tuple, set)):
        return [redact(v, key, depth + 1) for v in list(value)[:_MAX_ITEMS]]
    if isinstance(value, str):
        if key and _is_email(key):
            return mask_email(value)
        return redact_text(value)
    if isinstance(value, (int, float, bool)) or value is None:
        return value
    return redact_text(str(value))


def redact_headers(headers: dict[str, str]) -> dict[str, str]:
    return {k: (REDACTED if _is_sensitive(k) else redact_text(v)) for k, v in headers.items()}
