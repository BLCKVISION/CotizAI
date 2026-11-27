"""Password rules for new accounts. The screen shows the same ones, but only the server is trusted."""

from __future__ import annotations

from .errores import DatoInvalido

MIN_PASSWORD_LENGTH = 10


def require_strong_password(password: str, email: str) -> None:
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
