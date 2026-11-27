"""Rules for the people who work together in one organisation."""

from __future__ import annotations

import re

from .errores import DatoInvalido

MAX_MEMBERS = 25
_EMAIL = re.compile(r"^[^@\s<>]+@[^@\s<>.]+(?:\.[^@\s<>.]+)+$")


def require_valid_email(email: str) -> None:
    if len(email) > 254 or not _EMAIL.match(email):
        raise DatoInvalido("Escriba un correo válido.")
