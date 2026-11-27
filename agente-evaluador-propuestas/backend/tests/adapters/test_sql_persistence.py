"""Suite de contrato de los repositorios SQL. Corre contra SQLite en archivo temporal (y PostgreSQL si hay URL)."""

import os
import shutil
import threading
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import create_engine, inspect

from evaluador.adapters.outbound.persistence.sql.factory import build_sql_repositories, run_migrations
from evaluador.domain.audit_trail import GENESIS, AuditEntry, compute_hash
from evaluador.domain.currency import ExchangeRate, RateOrigin
from evaluador.domain.evaluation import Verdict
from evaluador.domain.identity import Role, Session, Tenant, User
from evaluador.domain.project import Project, ProjectState
from evaluador.domain.review import Review, ReviewKind
from evaluador.domain.supplier import Supplier, SupplierRecord
from evaluador.domain.workflow import EventKind, Job, JobEvent, JobStatus, Proposal

NOW = datetime(2026, 11, 26, 12, 0, tzinfo=UTC)
A, B = "tenant-a", "tenant-b"


@pytest.fixture(scope="session")
def migrated_template(tmp_path_factory):
    """Base SQLite ya migrada una sola vez; cada prueba trabaja sobre una copia."""
    path = tmp_path_factory.mktemp("tpl") / "template.db"
    run_migrations(f"sqlite:///{path}")
    return path


@pytest.fixture(params=["sqlite", "postgres"])
def repos(request, tmp_path, migrated_template):
    if request.param == "postgres":
        url = os.environ.get("EVALUADOR_TEST_DATABASE_URL")
        if not url:
            pytest.skip("Defina EVALUADOR_TEST_DATABASE_URL para probar PostgreSQL.")
        run_migrations(url, "base")
        run_migrations(url)
    else:
        shutil.copy(migrated_template, tmp_path / "test.db")
        url = f"sqlite:///{tmp_path / 'test.db'}"
    r = build_sql_repositories(url)
    yield r
    r.dispose()


def user(i="u1", tenant=A, email="a@x.test", **kw) -> User:
    return User(id=i, tenant_id=tenant, email=email, password_hash="h", role=Role.EVALUATOR, **kw)


def project(i="p1", tenant=A, **kw) -> Project:
    base = dict(
        id=i, tenant_id=tenant, name="Lab", requirement="11 PCs", location="Caracas",
        reference_budget=Decimal("12000.50"), state=ProjectState.RECEIVING, created_by="u1", created=NOW,
    )  # fmt: skip
    return Project(**(base | kw))


def job(i="j1", tenant=A, created=NOW, **kw) -> Job:
    return Job(id=i, tenant_id=tenant, project_id="p1", requested_by="u1", created=created, **kw)


# ---------------- identidad ----------------
def test_tenant_roundtrip_by_id_and_code(repos):
    repos.tenants.save(Tenant(id=A, code="alfa", name="Alfa"))
    assert repos.tenants.by_id(A) == Tenant(id=A, code="alfa", name="Alfa", active=True)
    assert repos.tenants.by_code("alfa").id == A
    assert repos.tenants.by_code("nope") is None and repos.tenants.by_id("nope") is None


def test_tenant_save_updates_existing(repos):
    repos.tenants.save(Tenant(id=A, code="alfa", name="Alfa"))
    repos.tenants.save(Tenant(id=A, code="alfa", name="Alfa 2", active=False))
    assert repos.tenants.by_id(A).name == "Alfa 2" and repos.tenants.by_id(A).active is False


def test_user_roundtrip_preserves_lockout_with_utc(repos):
    u = user(failed_attempts=3, blocked_until=NOW + timedelta(minutes=15))
    repos.users.save(u)
    got = repos.users.by_email("a@x.test")
    assert got == u and got.blocked_until.tzinfo is not None
    assert repos.users.by_id(A, "u1") == u


def test_user_by_id_is_tenant_scoped(repos):
    repos.users.save(user())
    assert repos.users.by_id(B, "u1") is None


def test_user_email_is_globally_unique(repos):
    repos.users.save(user("u1", A, "dup@x.test"))
    with pytest.raises(ValueError, match="correo"):
        repos.users.save(user("u2", B, "dup@x.test"))


def test_user_update_keeps_email(repos):
    repos.users.save(user())
    repos.users.save(user(failed_attempts=2))
    assert repos.users.by_id(A, "u1").failed_attempts == 2


def test_session_roundtrip_by_token_hash(repos):
    s = Session("s1", A, "u1", "hash-1", NOW, NOW + timedelta(hours=8), NOW)
    repos.sessions.save(s)
    assert repos.sessions.by_token_hash("hash-1") == s
    repos.sessions.save(s.revoke())
    assert repos.sessions.by_token_hash("hash-1").revoked is True
    assert repos.sessions.by_token_hash("otro") is None


# ---------------- proyectos ----------------
def test_project_roundtrip_keeps_decimal_and_state(repos):
    p = project(reference_budget=Decimal("12345678.90"), state=ProjectState.CLOSED, closing_reason="sin fondos")
    repos.projects.save(p)
    got = repos.projects.by_id(A, "p1")
    assert got == p and isinstance(got.reference_budget, Decimal) and got.reference_budget == Decimal("12345678.90")


def test_project_without_budget(repos):
    repos.projects.save(project(reference_budget=None))
    assert repos.projects.by_id(A, "p1").reference_budget is None


def test_project_isolation_and_listing_order(repos):
    repos.projects.save(project("p1", A, created=NOW))
    repos.projects.save(project("p2", A, created=NOW + timedelta(hours=1)))
    repos.projects.save(project("p3", B))
    assert [p.id for p in repos.projects.list_all(A)] == ["p2", "p1"]  # más reciente primero
    assert repos.projects.by_id(B, "p1") is None and repos.projects.by_id(A, "p3") is None


def test_project_save_cannot_hijack_another_tenants_row(repos):
    repos.projects.save(project("p1", A))
    with pytest.raises(ValueError):
        repos.projects.save(project("p1", B, name="robado"))
    assert repos.projects.by_id(A, "p1").name == "Lab"


# ---------------- tasas ----------------
def rate(value="40.25", d=date(2026, 11, 26), origin=RateOrigin.BCV) -> ExchangeRate:
    return ExchangeRate("USD", "VES", Decimal(value), "BCV", d, origin)


def test_exchange_rates_roundtrip_and_replace_same_key(repos):
    repos.exchange_rates.save(A, rate("40.25"))
    repos.exchange_rates.save(A, rate("41.00"))  # mismo par, fecha y origen: reemplaza
    repos.exchange_rates.save(A, rate("42.00", origin=RateOrigin.MANUAL))
    got = repos.exchange_rates.list_for(A)
    assert sorted(r.value for r in got) == [Decimal("41.00"), Decimal("42.00")]
    assert all(isinstance(r.value, Decimal) for r in got)


def test_exchange_rates_isolated_by_tenant(repos):
    repos.exchange_rates.save(A, rate())
    assert repos.exchange_rates.list_for(B) == []


# ---------------- propuestas ----------------
def proposal(i="pr1", tenant=A, project_id="p1") -> Proposal:
    return Proposal(i, tenant, project_id, "Alfa.pdf", "ab" * 32, 1234, f"k-{i}", "u1", NOW)


def test_proposal_roundtrip_list_delete_and_isolation(repos):
    repos.proposals.save(proposal("pr1"))
    repos.proposals.save(proposal("pr2"))
    repos.proposals.save(proposal("pr3", B))
    assert repos.proposals.by_id(A, "pr1") == proposal("pr1")
    assert repos.proposals.by_id(B, "pr1") is None
    assert sorted(p.id for p in repos.proposals.list_for_project(A, "p1")) == ["pr1", "pr2"]
    repos.proposals.delete(B, "pr1")  # otro tenant no puede borrar
    assert repos.proposals.by_id(A, "pr1") is not None
    repos.proposals.delete(A, "pr1")
    assert repos.proposals.by_id(A, "pr1") is None


# ---------------- trabajos ----------------
def test_job_roundtrip_update_and_isolation(repos):
    repos.jobs.enqueue(job())
    assert repos.jobs.by_id(A, "j1") == job()
    assert repos.jobs.by_id(B, "j1") is None
    done = Job("j1", A, "p1", "u1", NOW, JobStatus.DONE, 1, NOW, NOW + timedelta(seconds=5), None)
    repos.jobs.update(done)
    assert repos.jobs.by_id(A, "j1") == done


def test_job_update_from_other_tenant_is_rejected(repos):
    repos.jobs.enqueue(job())
    with pytest.raises(ValueError):
        repos.jobs.update(Job("j1", B, "p1", "u1", NOW, JobStatus.FAILED, 1, NOW, NOW, "x"))
    assert repos.jobs.by_id(A, "j1").status is JobStatus.QUEUED


def test_latest_job_for_project(repos):
    repos.jobs.enqueue(job("j1", created=NOW))
    repos.jobs.enqueue(job("j2", created=NOW + timedelta(minutes=1)))
    repos.jobs.enqueue(job("j3", B, created=NOW + timedelta(minutes=5)))
    assert repos.jobs.latest_for_project(A, "p1").id == "j2"
    assert repos.jobs.latest_for_project(A, "otro") is None


def test_claim_next_takes_oldest_queued_and_marks_running(repos):
    repos.jobs.enqueue(job("j2", created=NOW + timedelta(minutes=1)))
    repos.jobs.enqueue(job("j1", created=NOW))
    first = repos.jobs.claim_next()
    assert first.id == "j1" and first.status is JobStatus.RUNNING and first.attempts == 1
    assert first.started is not None and first.started.tzinfo is not None
    assert repos.jobs.by_id(A, "j1").status is JobStatus.RUNNING
    assert repos.jobs.claim_next().id == "j2"
    assert repos.jobs.claim_next() is None


def test_claim_next_never_gives_the_same_job_to_two_workers(repos):
    n = 12
    for i in range(n):
        repos.jobs.enqueue(job(f"j{i:02d}", created=NOW + timedelta(seconds=i)))
    taken: list[str] = []
    lock = threading.Lock()

    def worker() -> None:
        while (j := repos.jobs.claim_next()) is not None:
            with lock:
                taken.append(j.id)

    threads = [threading.Thread(target=worker) for _ in range(4)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert sorted(taken) == [f"j{i:02d}" for i in range(n)]  # todos, y ninguno repetido


# ---------------- eventos y resultados ----------------
def event(seq, tenant=A, job_id="j1") -> JobEvent:
    return JobEvent(job_id, seq, NOW + timedelta(seconds=seq), EventKind.READ, f"leyendo {seq}")


def test_events_append_list_after_and_isolation(repos):
    for s in (1, 2, 3):
        repos.job_events.append(A, event(s))
    repos.job_events.append(B, event(1))
    assert [e.seq for e in repos.job_events.list_after(A, "j1")] == [1, 2, 3]
    assert [e.seq for e in repos.job_events.list_after(A, "j1", 2)] == [3]
    assert [e.message for e in repos.job_events.list_after(B, "j1")] == ["leyendo 1"]
    assert repos.job_events.list_after(A, "j1")[0].kind is EventKind.READ


def test_events_reject_duplicate_seq(repos):
    repos.job_events.append(A, event(1))
    with pytest.raises(ValueError):
        repos.job_events.append(A, event(1))


def test_result_roundtrip_overwrite_and_isolation(repos):
    payload = {"id": "j1", "ranking": ["a", "b"], "delta": "3", "n": {"x": [1, None, "ñ"]}}
    repos.results.save(A, "j1", payload)
    assert repos.results.get(A, "j1") == payload
    assert repos.results.get(B, "j1") is None
    repos.results.save(A, "j1", {"id": "j1", "ranking": []})
    assert repos.results.get(A, "j1") == {"id": "j1", "ranking": []}


def test_result_save_cannot_hijack_other_tenant(repos):
    repos.results.save(A, "j1", {"a": 1})
    with pytest.raises(ValueError):
        repos.results.save(B, "j1", {"a": 2})
    assert repos.results.get(A, "j1") == {"a": 1}


# ---------------- auditoría ----------------
def entry(seq, prev, tenant=A) -> AuditEntry:
    at = NOW + timedelta(seconds=seq)
    h = compute_hash(tenant_id=tenant, seq=seq, at=at, actor="u1", action="x", detail="d", prev_hash=prev)
    return AuditEntry(tenant, seq, at, "u1", "x", "d", prev, h)


def test_audit_append_last_list_and_isolation(repos):
    e1 = entry(1, GENESIS)
    e2 = entry(2, e1.hash)
    repos.audit_trail.append(e1)
    repos.audit_trail.append(e2)
    repos.audit_trail.append(entry(1, GENESIS, B))
    assert repos.audit_trail.last(A) == e2
    assert repos.audit_trail.list_for(A) == [e1, e2]
    assert len(repos.audit_trail.list_for(B)) == 1
    assert repos.audit_trail.last("nadie") is None


def test_audit_append_rejects_repeated_seq(repos):
    repos.audit_trail.append(entry(1, GENESIS))
    with pytest.raises(ValueError):
        repos.audit_trail.append(entry(1, GENESIS))


# ---------------- proveedores ----------------
def test_supplier_lookup_by_rif_name_and_isolation(repos):
    s = Supplier("s1", A, "Alfa C.A.", "J123456789", "Caracas", "ventas@alfa.test")
    repos.suppliers.save(s)
    repos.suppliers.save(Supplier("s2", A, "Sin RIF"))
    repos.suppliers.save(Supplier("s3", B, "Alfa C.A.", "J123456789"))
    assert repos.suppliers.by_id(A, "s1") == s
    assert repos.suppliers.by_rif(A, "J123456789").id == "s1"
    assert repos.suppliers.by_rif(B, "J123456789").id == "s3"
    assert repos.suppliers.by_name(A, "alfa c.a.").id == "s1"  # sin distinguir mayúsculas
    assert repos.suppliers.by_id(B, "s1") is None and repos.suppliers.by_rif(A, "J000") is None
    assert sorted(x.id for x in repos.suppliers.list_for(A)) == ["s1", "s2"]


def test_supplier_rif_unique_per_tenant_and_updates_allowed(repos):
    repos.suppliers.save(Supplier("s1", A, "Alfa", "J1"))
    repos.suppliers.save(Supplier("s1", A, "Alfa renombrada", "J1"))
    assert repos.suppliers.by_id(A, "s1").name == "Alfa renombrada"
    with pytest.raises(ValueError):
        repos.suppliers.save(Supplier("s9", A, "Otro", "J1"))


def test_supplier_records_ordered_and_isolated(repos):
    r1 = SupplierRecord(A, "s1", "j1", "p1", "Alfa", Verdict.DISCARDED, "ARITMETICA: x", NOW)
    r2 = SupplierRecord(A, "s1", "j2", "p2", "Alfa", Verdict.VALID, "", NOW + timedelta(days=1))
    repos.suppliers.add_record(r2)
    repos.suppliers.add_record(r1)
    assert repos.suppliers.records(A, "s1") == [r1, r2]
    assert repos.suppliers.records(B, "s1") == []


# ---------------- revisiones ----------------
def test_reviews_roundtrip_payload_order_and_isolation(repos):
    r1 = Review("r1", A, "j1", "Alfa", "u1", ReviewKind.CORRECTION, "corrijo", NOW, {"verdict": "valid"})
    r2 = Review("r2", A, "j1", None, "u2", ReviewKind.NOTE, "nota", NOW + timedelta(minutes=1))
    repos.reviews.add(r2)
    repos.reviews.add(r1)
    repos.reviews.add(Review("r3", B, "j1", None, "u9", ReviewKind.NOTE, "otra", NOW))
    assert repos.reviews.list_for_job(A, "j1") == [r1, r2]
    assert [r.id for r in repos.reviews.list_for_job(B, "j1")] == ["r3"]


# ---------------- esquema y migraciones ----------------
def test_every_business_table_has_tenant_id_indexed(tmp_path):
    url = f"sqlite:///{tmp_path / 'm.db'}"
    run_migrations(url)
    insp = inspect(create_engine(url))
    sin_tenant = {"alembic_version", "tenants"}
    for table in set(insp.get_table_names()) - sin_tenant:
        cols = {c["name"] for c in insp.get_columns(table)}
        assert "tenant_id" in cols, table
        indexed = [i["column_names"] for i in insp.get_indexes(table)] + [
            insp.get_pk_constraint(table)["constrained_columns"]
        ]
        uniques = [u["column_names"] for u in insp.get_unique_constraints(table)]
        assert any(c and c[0] == "tenant_id" for c in indexed + uniques), f"{table}: tenant_id sin índice"


def test_migration_downgrade_and_upgrade_are_reversible(tmp_path):
    url = f"sqlite:///{tmp_path / 'm.db'}"
    run_migrations(url)
    assert {"users", "jobs", "audit_trail", "projects"} <= set(inspect(create_engine(url)).get_table_names())
    run_migrations(url, "base")
    assert set(inspect(create_engine(url)).get_table_names()) <= {"alembic_version"}
    run_migrations(url)
    assert "users" in inspect(create_engine(url)).get_table_names()


def test_factory_normalizes_postgres_urls():
    from evaluador.adapters.outbound.persistence.sql.factory import normalize_url

    assert normalize_url("postgresql://u:p@h/db") == "postgresql+psycopg://u:p@h/db"
    assert normalize_url("postgres://u:p@h/db") == "postgresql+psycopg://u:p@h/db"
    assert normalize_url("postgresql+psycopg://u:p@h/db") == "postgresql+psycopg://u:p@h/db"
    assert normalize_url("sqlite:///x.db") == "sqlite:///x.db"
