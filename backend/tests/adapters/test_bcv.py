"""BCV adapter. The HTML below is a SYNTHETIC sample shaped like the BCV page: it was NOT captured from the live site
(this server cannot reach it), so the parser is deliberately strict and falls back to manual rates on any surprise."""

from datetime import date
from decimal import Decimal

import httpx
import pytest

from evaluador.adapters.outbound.exchange_rates.bcv import BcvExchangeRateSource, parse_bcv_rates
from evaluador.domain.errores import TasaNoDisponible
from evaluador.domain.moneda import OrigenDeTasa

HTML = """
<div id="euro" class="col-sm-12"><div class="field-content"><div class="row">
  <div class="col-sm-6"><span> EUR</span></div>
  <div class="col-sm-6 centrado"><strong> 1.040,12340000 </strong></div></div></div></div>
<div id="dolar" class="col-sm-12"><div class="field-content"><div class="row">
  <div class="col-sm-6"><span> USD</span></div>
  <div class="col-sm-6 centrado"><strong> 36,48230000 </strong></div></div></div></div>
<span class="date-display-single" content="2026-11-27T00:00:00-04:00">Viernes, 27 Noviembre 2026</span>
"""
TODAY = date(2026, 11, 26)


def test_parses_usd_and_eur_against_ves_with_spanish_number_format():
    rates = {r.de: r for r in parse_bcv_rates(HTML, TODAY)}
    assert rates["USD"].valor == Decimal("36.48230000") and rates["USD"].a == "VES"
    assert rates["EUR"].valor == Decimal("1040.12340000")
    assert all(r.origen == OrigenDeTasa.BCV and "bcv.org.ve" in r.fuente for r in rates.values())


def test_uses_the_value_date_from_the_page_or_the_retrieval_date_when_absent():
    assert parse_bcv_rates(HTML, TODAY)[0].fecha == date(2026, 11, 27)
    sin_fecha = HTML.replace('content="2026-11-27T00:00:00-04:00"', "")
    assert parse_bcv_rates(sin_fecha, TODAY)[0].fecha == TODAY


@pytest.mark.parametrize(
    "html",
    [
        "",
        "<html>mantenimiento</html>",
        '<div id="dolar"><strong> abc </strong></div>',
        '<div id="dolar"><strong> 0 </strong></div>',
    ],
)
def test_unexpected_pages_raise_instead_of_guessing(html):
    with pytest.raises(TasaNoDisponible):
        parse_bcv_rates(html, TODAY)


def source(handler) -> BcvExchangeRateSource:
    return BcvExchangeRateSource(lambda: TODAY, client=httpx.Client(transport=httpx.MockTransport(handler)))


def test_fetch_reads_the_page():
    assert len(source(lambda r: httpx.Response(200, text=HTML)).fetch()) == 2


@pytest.mark.parametrize("status", [403, 500, 503])
def test_http_errors_become_rate_unavailable(status):
    with pytest.raises(TasaNoDisponible):
        source(lambda r: httpx.Response(status)).fetch()


def test_network_and_tls_failures_become_rate_unavailable():
    def boom(request):
        raise httpx.ConnectError("certificate verify failed")

    with pytest.raises(TasaNoDisponible):
        source(boom).fetch()


def test_oversized_responses_are_refused():
    with pytest.raises(TasaNoDisponible):
        source(lambda r: httpx.Response(200, content=b"x" * 2_000_001)).fetch()


def test_redirects_are_not_followed():
    with pytest.raises(TasaNoDisponible):
        source(lambda r: httpx.Response(302, headers={"location": "http://169.254.169.254/"})).fetch()
