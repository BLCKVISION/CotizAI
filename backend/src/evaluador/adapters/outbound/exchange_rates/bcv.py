"""Automatic rates from the BCV home page.

TLS verification is never disabled. The page structure is outside our control, so parsing is strict and any surprise
raises `TasaNoDisponible`: the use case then falls back to the latest manual rate instead of trusting a bad parse.
"""

from __future__ import annotations

import re
import ssl
from collections.abc import Callable
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path

import httpx

from evaluador.domain.errores import TasaNoDisponible
from evaluador.domain.moneda import MONEDA_PIVOTE, OrigenDeTasa, TasaDeCambio

BCV_URL = "https://www.bcv.org.ve/"
_CODES = {"dolar": "USD", "euro": "EUR"}
_BLOCK = re.compile(
    r'<div[^>]*\bid="(?P<id>dolar|euro)"[^>]*>(?:(?!<div[^>]*\bid=").){0,2000}?<strong\b[^>]*>\s*(?P<value>[\d.,]+)\s*</strong>',
    re.IGNORECASE | re.DOTALL,
)
_VALUE_DATE = re.compile(r'content="(\d{4}-\d{2}-\d{2})T')
_LABELLED_VALUE_DATE = re.compile(r'Fecha\s+Valor:[^<]*<span\b[^>]*?content="(\d{4}-\d{2}-\d{2})T', re.IGNORECASE)
_MAX_BYTES = 2_000_000
_MIN_PLAUSIBLE, _MAX_PLAUSIBLE = Decimal("0.0001"), Decimal("1000000")


# bcv.org.ve serves the wrong intermediate certificate, so no client can build its chain. This is the public Sectigo
# intermediate named by the site's own certificate (AIA), valid until 2036.
_MISSING_INTERMEDIATE = Path(__file__).with_name("sectigo_ov_r36.pem")


def _tls_context() -> ssl.SSLContext:
    """Full verification. The added intermediate only completes the chain: it must still end in a system root."""
    context = ssl.create_default_context()
    context.load_verify_locations(cafile=str(_MISSING_INTERMEDIATE))
    context.verify_flags &= ~ssl.VERIFY_X509_PARTIAL_CHAIN
    return context


def _to_decimal(text: str) -> Decimal | None:
    """BCV writes Spanish numbers: '1.234,5678' (dot = thousands, comma = decimals)."""
    try:
        value = Decimal(text.replace(".", "").replace(",", "."))
    except InvalidOperation:
        return None
    return value if value.is_finite() and _MIN_PLAUSIBLE <= value <= _MAX_PLAUSIBLE else None


def parse_bcv_rates(html: str, retrieved_on: date) -> list[TasaDeCambio]:
    """Rates of USD and EUR against VES. The value date is used when present; otherwise the retrieval date."""
    # The page carries other dated blocks: the one labelled "Fecha Valor" is the one that dates the rates.
    value_date = _LABELLED_VALUE_DATE.search(html) or _VALUE_DATE.search(html)
    effective = date.fromisoformat(value_date.group(1)) if value_date else retrieved_on
    origin = f"BCV {BCV_URL} (fecha valor {effective.isoformat()})"
    rates: dict[str, TasaDeCambio] = {}
    for match in _BLOCK.finditer(html):
        code = _CODES[match.group("id").lower()]
        value = _to_decimal(match.group("value"))
        if value is not None and code not in rates:
            rates[code] = TasaDeCambio(code, MONEDA_PIVOTE, value, origin, effective, OrigenDeTasa.BCV)
    if not rates:
        raise TasaNoDisponible("No se pudieron leer tasas del BCV.")
    return list(rates.values())


class BcvExchangeRateSource:
    def __init__(
        self, today: Callable[[], date], client: httpx.Client | None = None, url: str = BCV_URL, timeout: float = 10.0
    ) -> None:
        self._today = today
        self._client = client or httpx.Client(timeout=timeout, follow_redirects=False, verify=_tls_context())
        self._url = url  # fijo por configuración: nunca viene de la persona usuaria (sin SSRF)

    def fetch(self) -> list[TasaDeCambio]:
        try:
            response = self._client.get(self._url)
            response.raise_for_status()
            if len(response.content) > _MAX_BYTES:
                raise TasaNoDisponible("La respuesta del BCV es demasiado grande.")
            return parse_bcv_rates(response.text, self._today())
        except (httpx.HTTPError, ValueError) as exc:  # red, TLS, HTTP != 2xx o fecha ilegible
            raise TasaNoDisponible("El BCV no está disponible.") from exc
