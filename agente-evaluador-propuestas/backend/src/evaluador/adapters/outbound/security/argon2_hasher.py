"""Hash de contraseñas con Argon2id (parámetros por defecto OWASP de argon2-cffi)."""

from __future__ import annotations

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError


class Argon2Hasher:
    def __init__(self) -> None:
        self._ph = PasswordHasher()  # Argon2id
        self._dummy_hash = self._ph.hash("ficticio-para-igualar-tiempos")

    def hash(self, password: str) -> str:
        return self._ph.hash(password)

    def verify(self, stored_hash: str, password: str) -> bool:
        try:
            return self._ph.verify(stored_hash, password)
        except (VerificationError, InvalidHashError):
            return False

    def verify_dummy(self, password: str) -> None:
        self.verify(self._dummy_hash, password)

    def requires_rehash(self, stored_hash: str) -> bool:
        return self._ph.check_needs_rehash(stored_hash)
