"""Tokens de sesión JWT (HS256). En el almacén solo se guarda su huella SHA-256."""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import UTC, datetime

import jwt

from evaluador.application.ports.salida import TokenClaims
from evaluador.domain.errores import SesionInvalida

ALGORITHM = "HS256"  # fixed on purpose: the algorithm is never taken from the token header
ISSUER = "cotizai"
AUDIENCE = "cotizai-api"
MIN_SECRET_BYTES = 32
_REQUIRED = ["iss", "aud", "sub", "tid", "jti", "iat", "exp"]


class JwtTokens:
    """Signed session tokens. The server-side session still decides revocation and inactivity."""

    def __init__(self, secret: str | None = None) -> None:
        # Without a configured secret each process signs with its own random one (development only).
        secret = secret or secrets.token_urlsafe(48)
        if len(secret.encode()) < MIN_SECRET_BYTES:
            raise ValueError(f"EVALUADOR_JWT_SECRET debe tener al menos {MIN_SECRET_BYTES} bytes.")
        self._secret = secret

    def issue(self, claims: TokenClaims) -> str:
        payload = {
            "iss": ISSUER,
            "aud": AUDIENCE,
            "sub": claims.user_id,
            "tid": claims.tenant_id,
            "jti": claims.session_id,
            "role": claims.role,
            "iat": int(claims.issued_at.timestamp()),
            "exp": int(claims.expires_at.timestamp()),
        }
        return jwt.encode(payload, self._secret, algorithm=ALGORITHM)

    def verify(self, token: str, now: datetime) -> TokenClaims:
        """Checks signature, issuer, audience, required claims and expiry against the application clock."""
        try:
            payload = jwt.decode(
                token,
                self._secret,
                algorithms=[ALGORITHM],
                issuer=ISSUER,
                audience=AUDIENCE,
                options={"require": _REQUIRED, "verify_exp": False, "verify_iat": False},
            )
            claims = TokenClaims(
                user_id=str(payload["sub"]),
                tenant_id=str(payload["tid"]),
                session_id=str(payload["jti"]),
                role=str(payload.get("role", "")),
                issued_at=datetime.fromtimestamp(int(payload["iat"]), UTC),
                expires_at=datetime.fromtimestamp(int(payload["exp"]), UTC),
            )
        except (jwt.PyJWTError, ValueError, TypeError, OverflowError) as error:
            raise SesionInvalida("Sesión inválida o expirada.") from error
        if now >= claims.expires_at:
            raise SesionInvalida("Sesión inválida o expirada.")
        return claims

    def huella(self, token: str) -> str:
        return hashlib.sha256(token.encode()).hexdigest()


class IdsUuid:
    def nuevo(self) -> str:
        return str(uuid.uuid4())


class RelojSistema:
    def ahora(self) -> datetime:
        return datetime.now(UTC)
