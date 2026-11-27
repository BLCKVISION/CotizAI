"""Routers de proveedores y revisiones sobre una app mínima con `app.state.container` ampliado."""

from dataclasses import fields
from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from evaluador.adapters.inbound.http.app import create_app
from evaluador.adapters.inbound.http.routers import reviews, suppliers
from evaluador.adapters.outbound.memory.reviews import InMemoryReviews
from evaluador.adapters.outbound.memory.suppliers import InMemorySuppliers
from evaluador.application.use_cases.reviews import AddReview, ListReviews
from evaluador.application.use_cases.suppliers import (
    CheckSupplierHistory,
    ListSuppliers,
    RegisterSupplierOutcomes,
    SupplierIdentity,
    SupplierRecords,
)
from evaluador.composition.settings import Settings
from evaluador.domain.evaluation import Verdict
from evaluador.domain.result import CostOut, ProposalResultOut, ResultOut
from tests.conftest import header

EVAL, OLD = "11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222"
NOW = datetime(2026, 1, 1, tzinfo=UTC)


class Lookup:
    known = {("t-alfa", EVAL): {"A", "B"}, ("t-alfa", OLD): {"A"}}

    def exists(self, tenant_id, job_id):
        return (tenant_id, job_id) in self.known

    def proposal_ids(self, tenant_id, job_id):
        return self.known.get((tenant_id, job_id))


class Audit:
    def __init__(self):
        self.calls = []

    def register(self, *, tenant_id, actor, action, detail=""):
        self.calls.append((action, detail))


@pytest.fixture
def wired(container):
    sup, rev, audit, lookup = InMemorySuppliers(), InMemoryReviews(), Audit(), Lookup()
    base = {f.name: getattr(container, f.name) for f in fields(container)}
    own = dict(  # el contenedor real ya trae estos casos de uso: el test sustituye los suyos, sobre sus propios repositorios
        add_review=AddReview(rev, lookup, container.ids, SimpleNamespace(now=lambda: datetime.now(UTC)), audit),
        list_reviews=ListReviews(rev, lookup),
        list_suppliers=ListSuppliers(sup),
        supplier_records=SupplierRecords(sup),
        check_supplier_history=CheckSupplierHistory(sup, lookup),
        register_outcomes=RegisterSupplierOutcomes(sup, container.ids, SimpleNamespace(now=lambda: datetime.now(UTC))),
    )
    ns = SimpleNamespace(**{**base, **own})
    return ns, audit


@pytest.fixture
def client(wired):
    app = create_app(Settings(log_level="CRITICAL"), wired[0])
    for module in (suppliers, reviews):
        app.include_router(module.router, prefix="/api/v1")
    return TestClient(app)


def _h(client, org="alfa", role="evaluator"):
    cache = client.__dict__.setdefault("_cached_logins", {})
    return cache.setdefault((org, role), header(client, org, role))


def _post(client, role="evaluator", org="alfa", evaluation=EVAL, **body):
    body = {"kind": "note", "text": "Revisar la garantía", "proposal_id": "A"} | body
    return client.post(f"/api/v1/evaluations/{evaluation}/reviews", json=body, headers=_h(client, org, role))


# ---------------- revisiones ----------------
def test_evaluator_adds_a_note_and_everyone_with_view_results_lists_it(client, wired):
    r = _post(client)
    assert r.status_code == 201
    body = r.json()
    assert body["kind"] == "note" and body["proposal_id"] == "A" and body["evaluation_id"] == EVAL
    assert body["author_id"] == "alfa-evaluator" and "tenant_id" not in body
    listed = client.get(f"/api/v1/evaluations/{EVAL}/reviews", headers=_h(client, role="auditor")).json()
    assert [x["id"] for x in listed] == [body["id"]]
    assert wired[1].calls[0][0] == "review_added"


@pytest.mark.parametrize("role", ["loader", "auditor"])
def test_loader_and_auditor_cannot_post_reviews(client, role):
    assert _post(client, role).status_code == 403


def test_loader_cannot_list_reviews(client):
    assert client.get(f"/api/v1/evaluations/{EVAL}/reviews", headers=_h(client, role="loader")).status_code == 403


def test_only_the_approver_can_post_a_decision(client):
    decision = {"kind": "decision", "text": "Adjudicar", "payload": {"decision": "award"}}
    assert _post(client, "evaluator", **decision).status_code == 403
    assert _post(client, "approver", **decision).status_code == 201


def test_correction_keeps_payload_and_invalid_input_is_422(client):
    ok = _post(client, kind="correction", text="Era válida", payload={"verdict": "valid"})
    assert ok.status_code == 201 and ok.json()["payload"] == {"verdict": "valid"}
    assert _post(client, kind="correction", text="x").status_code == 422  # sin payload
    assert _post(client, text="").status_code == 422
    assert _post(client, text="x" * 2001).status_code == 422
    assert _post(client, kind="gossip").status_code == 422
    assert _post(client, proposal_id="Z").status_code == 422  # no pertenece a la evaluación


def test_extra_fields_such_as_tenant_are_rejected(client):
    assert _post(client, tenant_id="t-beta").status_code == 422


def test_unknown_or_foreign_evaluation_is_404_and_bad_id_is_422(client):
    other = "33333333-3333-3333-3333-333333333333"
    assert _post(client, evaluation=other).status_code == 404
    assert _post(client, org="beta").status_code == 404  # existe en alfa, no en beta
    assert client.get(f"/api/v1/evaluations/{other}/reviews", headers=_h(client)).status_code == 404
    assert client.get("/api/v1/evaluations/not-a-uuid/reviews", headers=_h(client)).status_code == 422


def test_requires_authentication(client):
    assert client.get(f"/api/v1/evaluations/{EVAL}/reviews").status_code == 401
    assert client.post(f"/api/v1/evaluations/{EVAL}/reviews", json={"kind": "note", "text": "x"}).status_code == 401


# ---------------- proveedores ----------------
def _seed(wired):
    reg = wired[0].register_outcomes

    def res(job, verdict):
        p = ProposalResultOut(id="A", supplier="Alfa C.A.", verdict=verdict, cost=CostOut(total=None))
        return ResultOut(id=job, project_id="p1", generated=NOW, delta="3", ranking=["A"], proposals=[p])

    ident = {"A": SupplierIdentity(name="Alfa C.A.", rif="J-111", location="Caracas")}
    reg.execute(tenant_id="t-alfa", job_id=OLD, project_id="p1", result=res(OLD, Verdict.DISCARDED), identities=ident)
    reg.execute(tenant_id="t-alfa", job_id=EVAL, project_id="p1", result=res(EVAL, Verdict.VALID), identities=ident)


def test_list_suppliers_and_records(client, wired):
    _seed(wired)
    (s,) = client.get("/api/v1/suppliers", headers=_h(client, role="loader")).json()
    assert s["name"] == "Alfa C.A." and s["rif"] == "J111" and s["location"] == "Caracas" and "tenant_id" not in s
    recs = client.get(f"/api/v1/suppliers/{s['id']}/records", headers=_h(client, role="auditor")).json()
    assert [r["verdict"] for r in recs] == ["discarded", "valid"] and recs[0]["job_id"] == OLD


def test_supplier_endpoints_respect_permissions_and_tenants(client, wired):
    _seed(wired)
    sid = client.get("/api/v1/suppliers", headers=_h(client)).json()[0]["id"]
    assert client.get(f"/api/v1/suppliers/{sid}/records", headers=_h(client, role="loader")).status_code == 403
    assert client.get(f"/api/v1/suppliers/{sid}/records", headers=_h(client, org="beta")).status_code == 404
    assert client.get("/api/v1/suppliers", headers=_h(client, org="beta")).json() == []
    assert client.get("/api/v1/suppliers").status_code == 401


def test_alerts_report_a_previous_discard_by_rif(client, wired):
    _seed(wired)
    (a,) = client.get(f"/api/v1/evaluations/{EVAL}/alerts", headers=_h(client)).json()
    assert a["proposal_id"] == "A" and a["rif"] == "J111" and a["previous_job_id"] == OLD
    assert a["previous_verdict"] == "discarded"
    assert client.get(f"/api/v1/evaluations/{OLD}/alerts", headers=_h(client)).json() == []
    assert client.get(f"/api/v1/evaluations/{EVAL}/alerts", headers=_h(client, role="loader")).status_code == 403
    other = "33333333-3333-3333-3333-333333333333"
    assert client.get(f"/api/v1/evaluations/{other}/alerts", headers=_h(client)).status_code == 404
