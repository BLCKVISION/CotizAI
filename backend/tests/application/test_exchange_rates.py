from datetime import UTC, date, datetime
from decimal import Decimal

import pytest

from evaluador.adapters.outbound.memory.exchange_rates import InMemoryExchangeRates
from evaluador.application.use_cases.exchange_rates import RegisterManualRate, ResolveRates
from evaluador.domain.errores import DatoInvalido, SinPermiso, TasaNoDisponible
from evaluador.domain.identidad import Rol, Usuario
from evaluador.domain.moneda import OrigenDeTasa, TasaDeCambio

TODAY = date(2026, 11, 26)


class Clock:
    def ahora(self) -> datetime:
        return datetime(2026, 11, 26, 12, tzinfo=UTC)


class Audit:
    def __init__(self) -> None:
        self.events: list[tuple[str | None, str | None, str, str]] = []

    def registrar(self, *, tenant_id: str | None, actor: str | None, accion: str, detalle: str = "") -> None:
        self.events.append((tenant_id, actor, accion, detalle))


class Source:
    def __init__(self, rates: list[TasaDeCambio] | None = None) -> None:
        self._rates = rates

    def fetch(self) -> list[TasaDeCambio]:
        if self._rates is None:
            raise TasaNoDisponible("caído")
        return self._rates


def user(role: Rol = Rol.EVALUADOR, tenant: str = "t1") -> Usuario:
    return Usuario(id="u1", tenant_id=tenant, correo="a@b.c", hash_contrasena="x", rol=role)


def bcv(value: str = "36.50", day: date = TODAY) -> TasaDeCambio:
    return TasaDeCambio("USD", "VES", Decimal(value), "BCV", day, OrigenDeTasa.BCV)


def register(repo, audit=None):
    return RegisterManualRate(repo, Clock(), audit or Audit())


def args(**kw):
    return {
        "base": "usd",
        "quote": "ves",
        "value": Decimal("40"),
        "source": "Oficio BCV 123",
        "effective_date": TODAY,
    } | kw


# ---- register manual rate
def test_evaluator_registers_a_manual_rate_with_source_date_and_audit():
    repo, audit = InMemoryExchangeRates(), Audit()
    rate = register(repo, audit).execute(user(), **args())
    assert (rate.de, rate.a, rate.origen) == ("USD", "VES", OrigenDeTasa.MANUAL)
    assert repo.list_for("t1") == [rate]
    assert audit.events == [("t1", "u1", "tasa_registrada", "USD/VES")]


@pytest.mark.parametrize("role", [Rol.CARGADOR, Rol.APROBADOR, Rol.AUDITOR])
def test_other_roles_cannot_register_rates(role):
    repo = InMemoryExchangeRates()
    with pytest.raises(SinPermiso):
        register(repo).execute(user(role), **args())
    assert repo.list_for("t1") == []


def test_manual_rate_requires_source_and_rejects_future_dates_and_bad_values():
    repo = InMemoryExchangeRates()
    for bad in (
        {"source": "  "},
        {"source": "​"},
        {"effective_date": date(2026, 11, 27)},
        {"value": Decimal(0)},
        {"value": Decimal("NaN")},
        {"quote": "usd"},
    ):
        with pytest.raises(DatoInvalido):
            register(repo).execute(user(), **args(**bad))
    assert repo.list_for("t1") == []


def test_rate_is_saved_under_the_actors_tenant_only():
    repo = InMemoryExchangeRates()
    register(repo).execute(user(tenant="t1"), **args())
    assert repo.list_for("t2") == []


# ---- resolve rates
def resolver(repo, source, max_age=3):
    return ResolveRates(source, repo, Clock(), max_age_days=max_age)


def test_automatic_rate_is_used_and_stored():
    repo = InMemoryExchangeRates()
    assert resolver(repo, Source([bcv()])).execute("t1") == [bcv()]
    assert repo.list_for("t1") == [bcv()]


def test_falls_back_to_the_latest_manual_rate_when_bcv_is_down():
    repo = InMemoryExchangeRates()
    manual = register(repo).execute(user(), **args())
    assert resolver(repo, Source(None)).execute("t1") == [manual]


def test_no_rate_at_all_fails_explicitly_instead_of_inventing_one():
    with pytest.raises(TasaNoDisponible):
        resolver(InMemoryExchangeRates(), Source(None)).execute("t1")


def test_stale_rates_are_not_in_force():
    repo = InMemoryExchangeRates()
    repo.save("t1", bcv(day=date(2026, 11, 20)))  # 6 days old
    with pytest.raises(TasaNoDisponible):
        resolver(repo, Source(None), max_age=3).execute("t1")
    assert resolver(repo, Source(None), max_age=6).execute("t1")


def test_future_dated_rates_are_not_in_force():
    repo = InMemoryExchangeRates()
    repo.save("t1", bcv(day=date(2099, 1, 1)))
    with pytest.raises(TasaNoDisponible):
        resolver(repo, Source(None)).execute("t1")


def test_resolving_never_leaks_another_tenants_manual_rate():
    repo = InMemoryExchangeRates()
    register(repo).execute(user(tenant="t1"), **args())
    with pytest.raises(TasaNoDisponible):
        resolver(repo, Source(None)).execute("t2")


def test_asking_bcv_twice_the_same_day_does_not_duplicate():
    repo = InMemoryExchangeRates()
    use_case = resolver(repo, Source([bcv()]))
    use_case.execute("t1")
    use_case.execute("t1")
    assert len(repo.list_for("t1")) == 1


def test_negative_max_age_is_rejected():
    with pytest.raises(DatoInvalido):
        resolver(InMemoryExchangeRates(), Source([]), max_age=-1)
