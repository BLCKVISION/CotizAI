"""Offline tests for OpenRouterMarketSearch using httpx.MockTransport."""

from __future__ import annotations

import json
from decimal import Decimal

import httpx

from evaluador.adapters.outbound.busqueda.openrouter_sonar import OpenRouterMarketSearch
from evaluador.domain.extraccion import Evidencia, ExtraccionPropuesta, Linea, Monto


def _extraction(price: str = "600", currency: str = "USD") -> ExtraccionPropuesta:
    return ExtraccionPropuesta(
        proveedor="Alfa C.A.",
        moneda=currency,
        lineas=[
            Linea(
                descripcion="Gabinete Ryzen 5 16GB RAM",
                categoria="gabinete",
                cantidad=Monto(literal="11", valor="11"),
                precio_unitario=Monto(literal=price, valor=price),
                total_linea=Monto(literal="6600", valor="6600"),
                evidencia=Evidencia(pagina_o_celda="p.1", texto="Gabinete x11"),
            )
        ],
    )


def test_market_search_parses_price_and_uses_cache() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(
            200,
            json={
                "choices": [{"message": {"content": json.dumps({"unit_price": 520})}}],
                "citations": ["https://a.example/x", "https://www.a.example/y", "https://b.example/z"],
            },
        )

    client = httpx.Client(base_url="https://mock.local", transport=httpx.MockTransport(handler))
    finder = OpenRouterMarketSearch(api_key="k", client=client)

    refs1 = finder.find_references(_extraction())
    refs2 = finder.find_references(_extraction())

    assert refs1[1].precio_unitario == Decimal("520")
    assert refs1[1].fuentes == 2  # distinct cited domains
    assert refs1[1].links == ("https://a.example/x", "https://b.example/z")
    assert refs1[1].moneda == "USD"
    assert refs2 == refs1
    assert calls == 1  # cached on second call


def test_market_search_returns_empty_on_http_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, json={"error": "unavailable"})

    client = httpx.Client(base_url="https://mock.local", transport=httpx.MockTransport(handler))
    finder = OpenRouterMarketSearch(api_key="k", client=client)
    assert finder.find_references(_extraction()) == {}


def test_price_without_citations_is_ignored_even_if_the_model_claims_sources() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        content = json.dumps({"unit_price": 1, "sources_count": 9})
        return httpx.Response(200, json={"choices": [{"message": {"content": content}}]})

    client = httpx.Client(base_url="https://mock.local", transport=httpx.MockTransport(handler))
    assert OpenRouterMarketSearch(api_key="k", client=client).find_references(_extraction()) == {}
