"""Proveedores y antecedentes: registra el resultado de cada evaluación y alerta de descartes previos por RIF."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, replace
from datetime import datetime

from evaluador.application.ports.output import Clock, IdGenerator
from evaluador.application.ports.workflow import SupplierRepository
from evaluador.application.use_cases.evaluation_lookup import EvaluationLookup
from evaluador.domain.errors import NotFound
from evaluador.domain.evaluation import Verdict
from evaluador.domain.identity import Permission, User
from evaluador.domain.result import ProposalResultOut, ResultOut
from evaluador.domain.supplier import Supplier, SupplierRecord, normalize_rif

_MAX_REASON = 500
_MAX_FINDING_REASON = 160


@dataclass(frozen=True, slots=True)
class SupplierIdentity:
    """Datos del proveedor tal como los extrajo el modelo (el `ResultOut` solo trae el nombre)."""

    name: str | None = None
    rif: str | None = None
    location: str | None = None
    contact: str | None = None


@dataclass(frozen=True, slots=True)
class SupplierAlert:
    proposal_id: str
    supplier: str
    rif: str
    previous_verdict: Verdict
    previous_reason: str
    previous_job_id: str


def _summary(p: ProposalResultOut) -> str:
    """Códigos y motivos de lo que descarta (o, si no hay, de los avisos). Sin evidencia: puede ser larga y sensible."""
    relevant = [f for f in p.findings if f.discards] or [f for f in p.findings if p.verdict is not Verdict.VALID]
    text = "; ".join(f"{f.code}: {f.reason.strip()[:_MAX_FINDING_REASON]}" for f in relevant)
    return text[:_MAX_REASON]


class RegisterSupplierOutcomes:
    """Lo invoca el worker al terminar una evaluación. Idempotente por (job_id, proposal_id)."""

    def __init__(self, suppliers: SupplierRepository, ids: IdGenerator, clock: Clock) -> None:
        self._suppliers, self._ids, self._clock = suppliers, ids, clock

    def _resolve(self, tenant_id: str, name: str, ident: SupplierIdentity) -> Supplier:
        rif = normalize_rif(ident.rif)
        # Con RIF solo se une por RIF: dos empresas con el mismo nombre y distinto RIF no se mezclan.
        found = self._suppliers.by_rif(tenant_id, rif) if rif else self._suppliers.by_name(tenant_id, name)
        if found is None:
            created = Supplier(
                self._ids.new(), tenant_id, name.strip(), rif, _clean(ident.location), _clean(ident.contact)
            )
            self._suppliers.save(created)
            return created
        merged = replace(  # completa lo que falte; nunca pisa un dato ya conocido
            found,
            rif=found.rif or rif,
            location=found.location or _clean(ident.location),
            contact=found.contact or _clean(ident.contact),
        )
        if merged != found:
            self._suppliers.save(merged)
        return merged

    def execute(
        self,
        *,
        tenant_id: str,
        job_id: str,
        project_id: str,
        result: ResultOut,
        identities: Mapping[str, SupplierIdentity] | None = None,
    ) -> int:
        """Devuelve cuántos antecedentes se agregaron (los ya registrados y las propuestas sin proveedor no cuentan)."""
        added = 0
        for p in result.proposals:
            ident = (identities or {}).get(p.id) or SupplierIdentity()
            name = (ident.name or p.supplier or "").strip()
            if not name:
                continue
            supplier = self._resolve(tenant_id, name, replace(ident, name=name))
            if any(
                r.job_id == job_id and r.proposal_id == p.id for r in self._suppliers.records(tenant_id, supplier.id)
            ):
                continue
            self._suppliers.add_record(
                SupplierRecord(
                    tenant_id, supplier.id, job_id, project_id, p.id, p.verdict, _summary(p), self._clock.now()
                )
            )
            added += 1
        return added


def _clean(value: str | None) -> str | None:
    return (value or "").strip() or None


class ListSuppliers:
    def __init__(self, suppliers: SupplierRepository) -> None:
        self._suppliers = suppliers

    def execute(self, actor: User) -> list[Supplier]:
        actor.require(Permission.VIEW_STATE)
        return sorted(self._suppliers.list_for(actor.tenant_id), key=lambda s: s.name.casefold())


class SupplierRecords:
    def __init__(self, suppliers: SupplierRepository) -> None:
        self._suppliers = suppliers

    def execute(self, actor: User, supplier_id: str) -> list[SupplierRecord]:
        actor.require(Permission.VIEW_RESULTS)
        if self._suppliers.by_id(actor.tenant_id, supplier_id) is None:  # también cubre «es de otro tenant»
            raise NotFound("Proveedor no encontrado.")
        return self._suppliers.records(actor.tenant_id, supplier_id)


class CheckSupplierHistory:
    """Alertas: el mismo proveedor (por RIF) fue descartado en una evaluación anterior a la consultada."""

    def __init__(self, suppliers: SupplierRepository, evaluations: EvaluationLookup) -> None:
        self._suppliers, self._evaluations = suppliers, evaluations

    def execute(self, actor: User, job_id: str) -> list[SupplierAlert]:
        actor.require(Permission.VIEW_RESULTS)
        if not self._evaluations.exists(actor.tenant_id, job_id):
            raise NotFound("Evaluación no encontrada.")
        alerts: list[SupplierAlert] = []
        for s in self._suppliers.list_for(actor.tenant_id):
            if s.rif is None:
                continue
            records = self._suppliers.records(actor.tenant_id, s.id)
            for current in (r for r in records if r.job_id == job_id):
                before = _previous_discard(records, job_id, current.at)
                if before is not None:
                    alerts.append(
                        SupplierAlert(current.proposal_id, s.name, s.rif, before.verdict, before.reason, before.job_id)
                    )
        return sorted(alerts, key=lambda a: a.proposal_id)


def _previous_discard(records: list[SupplierRecord], job_id: str, before: datetime) -> SupplierRecord | None:
    older = [r for r in records if r.job_id != job_id and r.verdict is Verdict.DISCARDED and r.at < before]
    return max(older, key=lambda r: r.at, default=None)
