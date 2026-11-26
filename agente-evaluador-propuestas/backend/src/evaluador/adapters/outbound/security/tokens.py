"""Tokens de sesión opacos de 256 bits; en el almacén solo se guarda su huella SHA-256."""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import UTC, datetime


class SecureTokens:
    def new(self) -> str:
        return secrets.token_urlsafe(32)

    def fingerprint(self, token: str) -> str:
        return hashlib.sha256(token.encode()).hexdigest()


class IdsUuid:
    def new(self) -> str:
        return str(uuid.uuid4())


class SystemClock:
    def now(self) -> datetime:
        return datetime.now(UTC)
