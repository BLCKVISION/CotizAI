"""Fuentes de precios de mercado: caché, adaptador HTTP con anti-SSRF y falso."""

import json
import threading
from datetime import UTC, datetime
from decimal import Decimal

import httpx
import pytest

from evaluador.adapters.outbound.search.cache import CachedMarketPrices
from evaluador.adapters.outbound.search.fake import FakeMarketPrices
from evaluador.adapters.outbound.search.http_prices import HttpMarketPrices, UnsafeUrl, assert_public_url
from evaluador.domain.market import PriceQuery, PriceReference

NOW = datetime(2026, 1, 1, tzinfo=UTC)
Q = PriceQuery(category="Monitor", brand="LG", model="27UL500", description="Monitor LG 27 pulgadas")


def ref(price="100", source="a.com") -> PriceReference:
    return PriceReference(Decimal(price), "USD", source, NOW)


# ---------------- caché ----------------
def test_repeated_component_is_queried_once():
    inner = FakeMarketPrices({"monitor": [ref()]})
    cached = CachedMarketPrices(inner, ttl_seconds=60)
    for _ in range(5):
        assert cached.lookup(Q) == [ref()]
    assert inner.calls == 1


def test_key_is_normalized_case_spaces_and_accents():
    inner = FakeMarketPrices({"monitor": [ref()]})
    cached = CachedMarketPrices(inner, ttl_seconds=60)
    cached.lookup(Q)
    cached.lookup(PriceQuery("  MONITOR ", "lg", "27ul500", "monitor   LG 27  pulgadás"))
    assert inner.calls == 1


def test_different_components_are_different_queries():
    inner = FakeMarketPrices({"monitor": [ref()], "teclado": [ref("10")]})
    cached = CachedMarketPrices(inner, ttl_seconds=60)
    cached.lookup(Q)
    cached.lookup(PriceQuery("teclado", None, None, "Teclado USB"))
    assert inner.calls == 2


def test_entry_expires_after_ttl():
    now = [0.0]
    inner = FakeMarketPrices({"monitor": [ref()]})
    cached = CachedMarketPrices(inner, ttl_seconds=10, clock=lambda: now[0])
    cached.lookup(Q)
    now[0] = 9.9
    cached.lookup(Q)
    assert inner.calls == 1
    now[0] = 10.1
    cached.lookup(Q)
    assert inner.calls == 2


def test_errors_are_not_cached():
    inner = FakeMarketPrices({"monitor": [ref()]}, fail_times=1)
    cached = CachedMarketPrices(inner, ttl_seconds=60)
    with pytest.raises(RuntimeError):
        cached.lookup(Q)
    assert cached.lookup(Q) == [ref()]
    assert inner.calls == 2


def test_concurrent_identical_queries_hit_the_source_once():
    inner = FakeMarketPrices({"monitor": [ref()]}, delay=0.05)
    cached = CachedMarketPrices(inner, ttl_seconds=60)
    threads = [threading.Thread(target=cached.lookup, args=(Q,)) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert inner.calls == 1


def test_cache_is_bounded():
    inner = FakeMarketPrices({})
    cached = CachedMarketPrices(inner, ttl_seconds=60, max_entries=3)
    for i in range(10):
        cached.lookup(PriceQuery(f"cat{i}", None, None, f"item {i}"))
    assert cached.size() <= 3


# ---------------- HTTP + anti-SSRF ----------------
def public(host: str) -> list[str]:
    return ["93.184.216.34"]


def test_disabled_without_url_or_key_returns_empty():
    assert HttpMarketPrices(url=None, api_key="k").lookup(Q) == []
    assert HttpMarketPrices(url="https://prices.example/api", api_key=None).lookup(Q) == []


@pytest.mark.parametrize(
    "url",
    [
        "http://localhost/x", "http://127.0.0.1/x", "http://10.0.0.5/x", "http://192.168.1.1/x",
        "http://169.254.169.254/latest/meta-data", "http://[::1]/x", "http://0.0.0.0/x", "ftp://example.com/x",
        "file:///etc/passwd", "http://user:pw@example.com/x", "http://metadata.google.internal/x",
    ],
)  # fmt: skip
def test_unsafe_urls_are_rejected(url):
    with pytest.raises(UnsafeUrl):
        assert_public_url(url, resolver=public)


def test_hostname_resolving_to_private_ip_is_rejected():
    with pytest.raises(UnsafeUrl):
        assert_public_url("https://evil.example/x", resolver=lambda h: ["10.1.2.3"])


def test_hostname_with_any_private_answer_is_rejected():
    with pytest.raises(UnsafeUrl):
        assert_public_url("https://evil.example/x", resolver=lambda h: ["93.184.216.34", "127.0.0.1"])


def test_configured_private_url_fails_at_construction():
    with pytest.raises(UnsafeUrl):
        HttpMarketPrices(url="http://127.0.0.1:9000/p", api_key="k", resolver=public)


def make(handler, **kw) -> HttpMarketPrices:
    return HttpMarketPrices(
        url="https://prices.example/api", api_key="secret", resolver=public,
        transport=httpx.MockTransport(handler), clock=lambda: NOW, **kw,
    )  # fmt: skip


def test_parses_results_and_sends_key_and_query():
    seen = {}

    def handler(req: httpx.Request) -> httpx.Response:
        seen["auth"] = req.headers.get("authorization")
        seen["q"] = dict(req.url.params)
        body = {"results": [{"price": "99.5", "currency": "usd", "source": "tienda.com"},
                            {"price": 105, "currency": "USD", "url": "https://otra.com/p/1"},
                            {"price": "-1", "currency": "USD", "source": "malo.com"},
                            {"price": "abc", "currency": "USD", "source": "malo2.com"}]}  # fmt: skip
        return httpx.Response(200, content=json.dumps(body))

    refs = make(handler).lookup(Q)
    assert [(r.price, r.currency, r.source) for r in refs] == [
        (Decimal("99.5"), "USD", "tienda.com"),
        (Decimal("105"), "USD", "otra.com"),
    ]
    assert seen["auth"] == "Bearer secret" and seen["q"]["category"] == "Monitor"


def test_redirect_to_private_host_is_not_followed():
    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(302, headers={"location": "http://169.254.169.254/latest"})

    with pytest.raises(UnsafeUrl):
        make(handler).lookup(Q)


def test_safe_redirect_is_followed_and_redirect_loops_are_cut():
    def ok(req: httpx.Request) -> httpx.Response:
        if req.url.path == "/api":
            return httpx.Response(302, headers={"location": "https://prices.example/v2"})
        return httpx.Response(200, json={"results": [{"price": "1", "currency": "USD", "source": "s"}]})

    assert len(make(ok).lookup(Q)) == 1

    def loop(req: httpx.Request) -> httpx.Response:
        return httpx.Response(302, headers={"location": "https://prices.example/api"})

    with pytest.raises(UnsafeUrl):
        make(loop).lookup(Q)


def test_http_error_and_oversized_body_raise():
    with pytest.raises(httpx.HTTPStatusError):
        make(lambda r: httpx.Response(500)).lookup(Q)
    with pytest.raises(ValueError):
        make(lambda r: httpx.Response(200, content=b"x" * 2_000_000)).lookup(Q)


def test_result_count_is_capped():
    body = {"results": [{"price": str(i + 1), "currency": "USD", "source": f"s{i}"} for i in range(100)]}
    assert len(make(lambda r: httpx.Response(200, json=body), max_results=5).lookup(Q)) == 5
