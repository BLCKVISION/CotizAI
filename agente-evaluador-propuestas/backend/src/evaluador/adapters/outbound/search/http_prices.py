"""Adaptador HTTP genérico de precios de mercado (proveedor configurable por URL y clave).

Sin URL o sin clave está deshabilitado y devuelve []. Anti-SSRF: solo http(s) sin credenciales en la URL, y el host
(configurado y de cada redirección) debe resolver únicamente a direcciones públicas; no se siguen redirecciones
automáticamente (se validan una a una, con tope). Limitación conocida: entre la validación DNS y la conexión un
atacante con control del DNS podría reasignar el host (DNS rebinding); mitigar con egress filtrado en la red.

Contrato esperado de la respuesta: {"results": [{"price": "99.5", "currency": "USD", "source": "tienda.com"}]}
(`source` o, si falta, el host de `url`).
"""

from __future__ import annotations

import ipaddress
import json
import socket
from collections.abc import Callable
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from urllib.parse import urljoin, urlsplit

import httpx

from evaluador.domain.market import PriceQuery, PriceReference

MAX_BODY_BYTES = 512 * 1024
MAX_REDIRECTS = 3
_BLOCKED_HOSTS = {"localhost", "metadata.google.internal", "metadata"}


class UnsafeUrl(ValueError):
    """La URL apunta (o redirige) a un destino no público o no permitido."""


def _resolve(host: str) -> list[str]:
    try:
        return sorted({str(info[4][0]) for info in socket.getaddrinfo(host, None)})
    except socket.gaierror as exc:
        raise UnsafeUrl("No se pudo resolver el host de la fuente de precios.") from exc


def _is_public(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip.split("%")[0])
    except ValueError:
        return False
    if isinstance(addr, ipaddress.IPv6Address) and addr.ipv4_mapped:
        addr = addr.ipv4_mapped
    return addr.is_global and not addr.is_multicast


def assert_public_url(url: str, *, resolver: Callable[[str], list[str]] = _resolve) -> None:
    parts = urlsplit(url)
    if parts.scheme not in {"http", "https"} or not parts.hostname:
        raise UnsafeUrl("Solo se admiten URL http(s).")
    if parts.username or parts.password:
        raise UnsafeUrl("La URL no puede llevar credenciales.")
    host = parts.hostname.lower().rstrip(".")
    if host in _BLOCKED_HOSTS or host.endswith((".localhost", ".internal", ".local")):
        raise UnsafeUrl("Host no permitido.")
    try:
        ipaddress.ip_address(host)
        addresses = [host]  # IP literal: se juzga tal cual
    except ValueError:
        addresses = resolver(host)
    if not addresses or not all(_is_public(a) for a in addresses):
        raise UnsafeUrl("El destino no es una dirección pública.")


def _to_reference(item: object, now: datetime) -> PriceReference | None:
    if not isinstance(item, dict):
        return None
    try:
        price = Decimal(str(item["price"]))
        currency = str(item["currency"]).strip().upper()
    except (KeyError, InvalidOperation, ValueError):
        return None
    source = str(item.get("source") or urlsplit(str(item.get("url") or "")).hostname or "").strip()
    if not (price.is_finite() and price > 0 and currency and source):
        return None
    return PriceReference(price, currency, source[:120], now)


class HttpMarketPrices:
    def __init__(
        self,
        *,
        url: str | None,
        api_key: str | None,
        timeout: float = 8.0,
        max_results: int = 20,
        resolver: Callable[[str], list[str]] = _resolve,
        transport: httpx.BaseTransport | None = None,
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._url, self._key, self._max, self._resolver, self._clock = url, api_key, max_results, resolver, clock
        self._enabled = bool(url and api_key)
        if self._enabled:
            assert_public_url(str(url), resolver=resolver)  # falla al arrancar, no en producción
        self._http = httpx.Client(timeout=timeout, follow_redirects=False, transport=transport)

    def _get(self, query: PriceQuery) -> bytes:
        url, params = str(self._url), {
            "q": query.description, "category": query.category, "brand": query.brand or "", "model": query.model or ""
        }  # fmt: skip
        for _ in range(MAX_REDIRECTS + 1):
            assert_public_url(url, resolver=self._resolver)
            with self._http.stream(
                "GET",
                url,
                params=params,
                headers={"Authorization": f"Bearer {self._key}", "Accept": "application/json"},
            ) as r:
                if r.is_redirect:
                    location = r.headers.get("location")
                    if not location:
                        raise UnsafeUrl("Redirección sin destino.")
                    url, params = urljoin(url, location), {}
                    continue
                r.raise_for_status()
                body = b""
                for chunk in r.iter_bytes():
                    body += chunk
                    if len(body) > MAX_BODY_BYTES:
                        raise ValueError("La respuesta de la fuente de precios es demasiado grande.")
                return body
        raise UnsafeUrl("Demasiadas redirecciones.")

    def lookup(self, query: PriceQuery) -> list[PriceReference]:
        if not self._enabled:
            return []
        data = json.loads(self._get(query))
        items = data.get("results", []) if isinstance(data, dict) else []
        now = self._clock()
        refs = (_to_reference(i, now) for i in items if isinstance(items, list))
        return [r for r in refs if r is not None][: self._max]
