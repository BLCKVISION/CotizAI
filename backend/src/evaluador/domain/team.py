"""Rules for the people who work together in one organisation."""

from __future__ import annotations

import re

from .errores import DatoInvalido

MAX_MEMBERS = 25
MIN_PASSWORD_LENGTH = 10
_EMAIL = re.compile(r"^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$")


def require_valid_email(email: str) -> None:
    if len(email) > 254 or not _EMAIL.match(email):
        raise DatoInvalido("Escriba un correo válido.")


def require_strong_password(password: str, email: str) -> None:
    """The same rules the screen shows; only the server is trusted."""
    user = email.split("@")[0].lower()
    strong = (
        len(password) >= MIN_PASSWORD_LENGTH
        and any(c.isupper() for c in password)
        and any(c.islower() for c in password)
        and any(c.isdigit() for c in password)
        and any(not c.isalnum() and not c.isspace() for c in password)
        and (len(user) < 3 or user not in password.lower())
    )
    if not strong:
        raise DatoInvalido(
            f"La contraseña necesita al menos {MIN_PASSWORD_LENGTH} caracteres, mayúsculas, minúsculas, un número, "
            "un símbolo y no puede contener su correo."
        )
