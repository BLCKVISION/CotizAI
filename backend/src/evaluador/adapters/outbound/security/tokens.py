"""Tokens de sesión opacos de 256 bits; en el almacén solo se guarda su huella SHA-256."""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import UTC, datetime


class TokensSeguros:
    def nuevo(self) -> str:
        return secrets.token_urlsafe(32)

    def huella(self, token: str) -> str:
        return hashlib.sha256(token.encode()).hexdigest()


class IdsUuid:
    def nuevo(self) -> str:
        return str(uuid.uuid4())


class RelojSistema:
    def ahora(self) -> datetime:
        return datetime.now(UTC)
