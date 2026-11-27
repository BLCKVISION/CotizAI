"""Proveedores, antecedentes y alertas de descartes previos.

CABLEADO (atributos del Container): list_suppliers, supplier_records, check_supplier_history.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Request

from evaluador.adapters.inbound.http.dtos import ID_PATTERN, OutputDto
from evaluador.adapters.inbound.http.guards import require
from evaluador.application.use_cases.authentication import AuthenticatedSession
from evaluador.application.use_cases.suppliers import SupplierAlert
from evaluador.domain.evaluation import Verdict
from evaluador.domain.identity import Permission
from evaluador.domain.supplier import Supplier, SupplierRecord

router = APIRouter(tags=["suppliers"])
SupplierId = Annotated[str, Path(pattern=ID_PATTERN)]
EvaluationId = Annotated[str, Path(pattern=ID_PATTERN)]


class SupplierResponse(OutputDto):
    id: str
    name: str
    rif: str | None
    location: str | None
    contact: str | None

    @classmethod
    def from_domain(cls, s: Supplier) -> SupplierResponse:
        return cls(id=s.id, name=s.name, rif=s.rif, location=s.location, contact=s.contact)


class SupplierRecordResponse(OutputDto):
    job_id: str
    project_id: str
    proposal_id: str
    verdict: Verdict
    reason: str
    at: datetime

    @classmethod
    def from_domain(cls, r: SupplierRecord) -> SupplierRecordResponse:
        return cls(
            job_id=r.job_id,
            project_id=r.project_id,
            proposal_id=r.proposal_id,
            verdict=r.verdict,
            reason=r.reason,
            at=r.at,
        )


class AlertResponse(OutputDto):
    proposal_id: str
    supplier: str
    rif: str
    previous_verdict: Verdict
    previous_reason: str
    previous_job_id: str

    @classmethod
    def from_domain(cls, a: SupplierAlert) -> AlertResponse:
        return cls(
            proposal_id=a.proposal_id,
            supplier=a.supplier,
            rif=a.rif,
            previous_verdict=a.previous_verdict,
            previous_reason=a.previous_reason,
            previous_job_id=a.previous_job_id,
        )


@router.get("/suppliers")
def list_suppliers(
    request: Request, session: Annotated[AuthenticatedSession, Depends(require(Permission.VIEW_STATE))]
) -> list[SupplierResponse]:
    return [SupplierResponse.from_domain(s) for s in request.app.state.container.list_suppliers.execute(session.user)]


@router.get("/suppliers/{supplier_id}/records")
def supplier_records(
    supplier_id: SupplierId,
    request: Request,
    session: Annotated[AuthenticatedSession, Depends(require(Permission.VIEW_RESULTS))],
) -> list[SupplierRecordResponse]:
    records = request.app.state.container.supplier_records.execute(session.user, supplier_id)
    return [SupplierRecordResponse.from_domain(r) for r in records]


@router.get("/evaluations/{evaluation_id}/alerts")
def evaluation_alerts(
    evaluation_id: EvaluationId,
    request: Request,
    session: Annotated[AuthenticatedSession, Depends(require(Permission.VIEW_RESULTS))],
) -> list[AlertResponse]:
    alerts = request.app.state.container.check_supplier_history.execute(session.user, evaluation_id)
    return [AlertResponse.from_domain(a) for a in alerts]
