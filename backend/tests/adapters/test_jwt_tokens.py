"""JWT session tokens: what is accepted and every way a token must be rejected."""

from datetime import UTC, datetime, timedelta

import jwt
import pytest

from evaluador.adapters.outbound.security.tokens import AUDIENCE, ISSUER, JwtTokens
from evaluador.application.ports.salida import TokenClaims
from evaluador.composition.configuracion import Configuracion
from evaluador.composition.contenedor import construir_contenedor
from evaluador.domain.errores import SesionInvalida

SECRET = "test-only-secret-long-enough-for-every-hmac-variant-used-in-these-tests"
NOW = datetime(2026, 11, 27, 12, 0, tzinfo=UTC)
CLAIMS = TokenClaims("user-1", "tenant-1", "session-1", "cargador", NOW, NOW + timedelta(hours=8))


def payload(**changes):
    base = {
        "iss": ISSUER,
        "aud": AUDIENCE,
        "sub": "user-1",
        "tid": "tenant-1",
        "jti": "session-1",
        "iat": int(NOW.timestamp()),
        "exp": int(CLAIMS.expires_at.timestamp()),
    }
    return {key: value for key, value in (base | changes).items() if value is not None}


def test_issued_token_is_a_jwt_and_round_trips():
    tokens = JwtTokens(SECRET)
    token = tokens.issue(CLAIMS)
    assert token.count(".") == 2
    assert jwt.get_unverified_header(token)["alg"] == "HS256"
    assert tokens.verify(token, NOW) == CLAIMS


def test_expired_token_is_rejected():
    tokens = JwtTokens(SECRET)
    with pytest.raises(SesionInvalida):
        tokens.verify(tokens.issue(CLAIMS), CLAIMS.expires_at)


@pytest.mark.parametrize(
    "forged",
    [
        jwt.encode(payload(), "another-secret-with-at-least-32-bytes", algorithm="HS256"),
        jwt.encode(payload(), "", algorithm="none"),
        jwt.encode(payload(), SECRET, algorithm="HS512"),
        jwt.encode(payload(aud="other-api"), SECRET, algorithm="HS256"),
        jwt.encode(payload(iss="other-issuer"), SECRET, algorithm="HS256"),
        jwt.encode(payload(jti=None), SECRET, algorithm="HS256"),
        jwt.encode(payload(exp=None), SECRET, algorithm="HS256"),
        "not-a-jwt",
    ],
    ids=["wrong-key", "alg-none", "other-alg", "audience", "issuer", "no-session", "no-expiry", "garbage"],
)
def test_forged_or_incomplete_tokens_are_rejected(forged):
    with pytest.raises(SesionInvalida):
        JwtTokens(SECRET).verify(forged, NOW)


def test_altered_payload_breaks_the_signature():
    tokens = JwtTokens(SECRET)
    header, _, signature = tokens.issue(CLAIMS).split(".")
    other = jwt.encode(payload(sub="someone-else"), SECRET, algorithm="HS256").split(".")[1]
    with pytest.raises(SesionInvalida):
        tokens.verify(f"{header}.{other}.{signature}", NOW)


def test_short_secret_is_refused():
    with pytest.raises(ValueError, match="32 bytes"):
        JwtTokens("short")


def test_production_requires_a_secret():
    with pytest.raises(ValueError, match="obligatorio"):
        construir_contenedor(config=Configuracion(_env_file=None, entorno="produccion", jwt_secret=None))
