"""Hash de contraseñas con Argon2id (parámetros por defecto OWASP de argon2-cffi)."""

from __future__ import annotations

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError


class Argon2Hasheador:
    def __init__(self) -> None:
        self._ph = PasswordHasher()  # Argon2id
        self._hash_ficticio = self._ph.hash("ficticio-para-igualar-tiempos")

    def hashear(self, contrasena: str) -> str:
        return self._ph.hash(contrasena)

    def verificar(self, hash_almacenado: str, contrasena: str) -> bool:
        try:
            return self._ph.verify(hash_almacenado, contrasena)
        except (VerificationError, InvalidHashError):
            return False

    def verificar_ficticio(self, contrasena: str) -> None:
        self.verificar(self._hash_ficticio, contrasena)

    def requiere_rehash(self, hash_almacenado: str) -> bool:
        return self._ph.check_needs_rehash(hash_almacenado)
