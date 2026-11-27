"""Repositorios SQL (SQLAlchemy Core). Cada operación es una transacción corta; no se comparte estado entre llamadas.

Todo método de lectura filtra por `tenant_id`. Una escritura que intente tomar una fila de otro tenant (mismo id) se
rechaza con ValueError en vez de sobrescribirla. Nunca se registra contenido de documentos.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy import RowMapping
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.exc import IntegrityError

from evaluador.domain.audit_trail import AuditEntry
from evaluador.domain.currency import ExchangeRate, RateOrigin
from evaluador.domain.evaluation import Verdict
from evaluador.domain.identity import Role, Session, Tenant, User
from evaluador.domain.project import Project, ProjectState
from evaluador.domain.review import Review, ReviewKind
from evaluador.domain.supplier import Supplier, SupplierRecord
from evaluador.domain.workflow import EventKind, Job, JobEvent, JobStatus, Proposal

from . import models as m

Row = RowMapping


class _Repo:
    def __init__(self, engine: Engine) -> None:
        self._engine = engine

    @staticmethod
    def _upsert(conn: Connection, table: sa.Table, key: Any, tenant_id: str, values: dict[str, Any]) -> None:
        """Inserta o actualiza por `id`; si el id ya es de otro tenant, no lo toca."""
        owner = conn.execute(sa.select(table.c.tenant_id).where(table.c.id == key)).scalar_one_or_none()
        if owner is None:
            conn.execute(sa.insert(table).values(id=key, tenant_id=tenant_id, **values))
        elif owner != tenant_id:
            raise ValueError("El identificador ya pertenece a otra organización.")
        else:
            conn.execute(sa.update(table).where(table.c.id == key, table.c.tenant_id == tenant_id).values(**values))

    def _one(self, stmt: sa.Select[Any]) -> Row | None:
        with self._engine.connect() as conn:
            return conn.execute(stmt).mappings().first()

    def _all(self, stmt: sa.Select[Any]) -> list[Row]:
        with self._engine.connect() as conn:
            return list(conn.execute(stmt).mappings().all())


# ---------------------------------------------------------------- identidad
class SqlTenants(_Repo):
    @staticmethod
    def _to(r: Row) -> Tenant:
        return Tenant(id=r["id"], code=r["code"], name=r["name"], active=r["active"])

    def by_id(self, tenant_id: str) -> Tenant | None:
        r = self._one(sa.select(m.tenants).where(m.tenants.c.id == tenant_id))
        return self._to(r) if r else None

    def by_code(self, code: str) -> Tenant | None:
        r = self._one(sa.select(m.tenants).where(m.tenants.c.code == code))
        return self._to(r) if r else None

    def save(self, tenant: Tenant) -> None:
        values = {"code": tenant.code, "name": tenant.name, "active": tenant.active}
        try:
            with self._engine.begin() as conn:
                found = conn.execute(sa.select(m.tenants.c.id).where(m.tenants.c.id == tenant.id)).first()
                if found:
                    conn.execute(sa.update(m.tenants).where(m.tenants.c.id == tenant.id).values(**values))
                else:
                    conn.execute(sa.insert(m.tenants).values(id=tenant.id, **values))
        except IntegrityError as exc:
            raise ValueError("El código de organización ya existe.") from exc


class SqlUsers(_Repo):
    @staticmethod
    def _to(r: Row) -> User:
        return User(
            id=r["id"], tenant_id=r["tenant_id"], email=r["email"], password_hash=r["password_hash"],
            role=Role(r["role"]), active=r["active"], failed_attempts=r["failed_attempts"],
            blocked_until=r["blocked_until"],
        )  # fmt: skip

    def by_email(self, email: str) -> User | None:
        r = self._one(sa.select(m.users).where(m.users.c.email == email))
        return self._to(r) if r else None

    def by_id(self, tenant_id: str, user_id: str) -> User | None:
        r = self._one(sa.select(m.users).where(m.users.c.tenant_id == tenant_id, m.users.c.id == user_id))
        return self._to(r) if r else None

    def save(self, user: User) -> None:
        values = {
            "email": user.email, "password_hash": user.password_hash, "role": str(user.role), "active": user.active,
            "failed_attempts": user.failed_attempts, "blocked_until": user.blocked_until,
        }  # fmt: skip
        try:
            with self._engine.begin() as conn:
                clash = conn.execute(
                    sa.select(m.users.c.id).where(m.users.c.email == user.email, m.users.c.id != user.id)
                ).first()
                if clash:
                    raise ValueError("El correo ya está registrado.")  # unicidad global: define el tenant del login
                self._upsert(conn, m.users, user.id, user.tenant_id, values)
        except IntegrityError as exc:  # carrera entre dos altas del mismo correo
            raise ValueError("El correo ya está registrado.") from exc


class SqlSessions(_Repo):
    def by_token_hash(self, token_hash: str) -> Session | None:
        r = self._one(sa.select(m.sessions).where(m.sessions.c.token_hash == token_hash))
        if r is None:
            return None
        return Session(
            id=r["id"], tenant_id=r["tenant_id"], user_id=r["user_id"], token_hash=r["token_hash"],
            created=r["created"], expires=r["expires"], last_activity=r["last_activity"], revoked=r["revoked"],
        )  # fmt: skip

    def save(self, session: Session) -> None:
        values = {
            "user_id": session.user_id, "token_hash": session.token_hash, "created": session.created,
            "expires": session.expires, "last_activity": session.last_activity, "revoked": session.revoked,
        }  # fmt: skip
        with self._engine.begin() as conn:
            self._upsert(conn, m.sessions, session.id, session.tenant_id, values)


# ---------------------------------------------------------------- proyectos y tasas
class SqlProjects(_Repo):
    @staticmethod
    def _to(r: Row) -> Project:
        return Project(
            id=r["id"], tenant_id=r["tenant_id"], name=r["name"], requirement=r["requirement"],
            location=r["location"], reference_budget=r["reference_budget"], state=ProjectState(r["state"]),
            created_by=r["created_by"], created=r["created"], closing_reason=r["closing_reason"],
        )  # fmt: skip

    def save(self, project: Project) -> None:
        values = {
            "name": project.name, "requirement": project.requirement, "location": project.location,
            "reference_budget": project.reference_budget, "state": str(project.state),
            "created_by": project.created_by, "created": project.created, "closing_reason": project.closing_reason,
        }  # fmt: skip
        with self._engine.begin() as conn:
            self._upsert(conn, m.projects, project.id, project.tenant_id, values)

    def by_id(self, tenant_id: str, project_id: str) -> Project | None:
        r = self._one(sa.select(m.projects).where(m.projects.c.tenant_id == tenant_id, m.projects.c.id == project_id))
        return self._to(r) if r else None

    def list_all(self, tenant_id: str) -> list[Project]:
        stmt = (
            sa.select(m.projects)
            .where(m.projects.c.tenant_id == tenant_id)
            .order_by(m.projects.c.created.desc(), m.projects.c.id)
        )
        return [self._to(r) for r in self._all(stmt)]


class SqlExchangeRates(_Repo):
    def save(self, tenant_id: str, rate: ExchangeRate) -> None:
        key = (
            m.exchange_rates.c.tenant_id == tenant_id,
            m.exchange_rates.c.base == rate.base,
            m.exchange_rates.c.quote == rate.quote,
            m.exchange_rates.c.effective_date == rate.effective_date,
            m.exchange_rates.c.origin == str(rate.origin),
        )
        with self._engine.begin() as conn:
            # La misma tasa (par, fecha, origen) se reemplaza: consultar el BCV varias veces el mismo día no duplica.
            conn.execute(sa.delete(m.exchange_rates).where(*key))
            conn.execute(
                sa.insert(m.exchange_rates).values(
                    tenant_id=tenant_id,
                    base=rate.base,
                    quote=rate.quote,
                    value=rate.value,
                    source=rate.source,
                    effective_date=rate.effective_date,
                    origin=str(rate.origin),
                )  # fmt: skip
            )

    def list_for(self, tenant_id: str) -> list[ExchangeRate]:
        stmt = (
            sa.select(m.exchange_rates)
            .where(m.exchange_rates.c.tenant_id == tenant_id)
            .order_by(m.exchange_rates.c.effective_date, m.exchange_rates.c.id)
        )
        return [
            ExchangeRate(
                base=r["base"],
                quote=r["quote"],
                value=r["value"],
                source=r["source"],
                effective_date=r["effective_date"],
                origin=RateOrigin(r["origin"]),
            )  # fmt: skip
            for r in self._all(stmt)
        ]


# ---------------------------------------------------------------- flujo de evaluación
class SqlProposals(_Repo):
    @staticmethod
    def _to(r: Row) -> Proposal:
        return Proposal(
            id=r["id"], tenant_id=r["tenant_id"], project_id=r["project_id"], filename=r["filename"],
            sha256=r["sha256"], size_bytes=r["size_bytes"], storage_key=r["storage_key"],
            uploaded_by=r["uploaded_by"], created=r["created"],
        )  # fmt: skip

    def save(self, proposal: Proposal) -> None:
        values = {
            "project_id": proposal.project_id, "filename": proposal.filename, "sha256": proposal.sha256,
            "size_bytes": proposal.size_bytes, "storage_key": proposal.storage_key,
            "uploaded_by": proposal.uploaded_by, "created": proposal.created,
        }  # fmt: skip
        with self._engine.begin() as conn:
            self._upsert(conn, m.proposals, proposal.id, proposal.tenant_id, values)

    def by_id(self, tenant_id: str, proposal_id: str) -> Proposal | None:
        r = self._one(
            sa.select(m.proposals).where(m.proposals.c.tenant_id == tenant_id, m.proposals.c.id == proposal_id)
        )
        return self._to(r) if r else None

    def list_for_project(self, tenant_id: str, project_id: str) -> list[Proposal]:
        stmt = (
            sa.select(m.proposals)
            .where(m.proposals.c.tenant_id == tenant_id, m.proposals.c.project_id == project_id)
            .order_by(m.proposals.c.created, m.proposals.c.id)
        )
        return [self._to(r) for r in self._all(stmt)]

    def delete(self, tenant_id: str, proposal_id: str) -> None:
        with self._engine.begin() as conn:
            conn.execute(
                sa.delete(m.proposals).where(m.proposals.c.tenant_id == tenant_id, m.proposals.c.id == proposal_id)
            )


class SqlJobs(_Repo):
    @staticmethod
    def _to(r: Row) -> Job:
        return Job(
            id=r["id"], tenant_id=r["tenant_id"], project_id=r["project_id"], requested_by=r["requested_by"],
            created=r["created"], status=JobStatus(r["status"]), attempts=r["attempts"], started=r["started"],
            finished=r["finished"], error=r["error"],
        )  # fmt: skip

    @staticmethod
    def _values(job: Job) -> dict[str, Any]:
        return {
            "project_id": job.project_id, "requested_by": job.requested_by, "created": job.created,
            "status": str(job.status), "attempts": job.attempts, "started": job.started,
            "finished": job.finished, "error": job.error,
        }  # fmt: skip

    def enqueue(self, job: Job) -> None:
        with self._engine.begin() as conn:
            self._upsert(conn, m.jobs, job.id, job.tenant_id, self._values(job))

    def claim_next(self) -> Job | None:
        """Toma el trabajo `queued` más antiguo y lo marca `running`, de forma atómica.

        PostgreSQL: `SELECT ... FOR UPDATE SKIP LOCKED` dentro de la misma transacción del `UPDATE`: cada worker
        salta las filas que otro ya bloqueó. SQLite (pruebas): el motor ignora la cláusula y las transacciones de
        escritura son `BEGIN IMMEDIATE` (ver factory), así que se serializan. En ambos casos el `UPDATE` es
        condicional (`status = 'queued'`): si otro lo tomó antes, no afecta filas y se pasa al siguiente.
        """
        with self._engine.begin() as conn:
            for _ in range(50):
                row = (
                    conn.execute(
                        sa.select(m.jobs)
                        .where(m.jobs.c.status == str(JobStatus.QUEUED))
                        .order_by(m.jobs.c.created, m.jobs.c.id)
                        .limit(1)
                        .with_for_update(skip_locked=True)
                    )
                    .mappings()
                    .first()
                )
                if row is None:
                    return None
                now = datetime.now(UTC)
                taken = conn.execute(
                    sa.update(m.jobs)
                    .where(m.jobs.c.id == row["id"], m.jobs.c.status == str(JobStatus.QUEUED))
                    .values(status=str(JobStatus.RUNNING), attempts=row["attempts"] + 1, started=now)
                )
                if taken.rowcount == 1:
                    got = conn.execute(sa.select(m.jobs).where(m.jobs.c.id == row["id"])).mappings().one()
                    return self._to(got)
        return None

    def update(self, job: Job) -> None:
        with self._engine.begin() as conn:
            done = conn.execute(
                sa.update(m.jobs)
                .where(m.jobs.c.id == job.id, m.jobs.c.tenant_id == job.tenant_id)
                .values(**self._values(job))
            )
            if done.rowcount == 0:
                raise ValueError("El trabajo no existe en esta organización.")

    def by_id(self, tenant_id: str, job_id: str) -> Job | None:
        r = self._one(sa.select(m.jobs).where(m.jobs.c.tenant_id == tenant_id, m.jobs.c.id == job_id))
        return self._to(r) if r else None

    def latest_for_project(self, tenant_id: str, project_id: str) -> Job | None:
        stmt = (
            sa.select(m.jobs)
            .where(m.jobs.c.tenant_id == tenant_id, m.jobs.c.project_id == project_id)
            .order_by(m.jobs.c.created.desc(), m.jobs.c.id.desc())
            .limit(1)
        )
        r = self._one(stmt)
        return self._to(r) if r else None


class SqlJobEvents(_Repo):
    def append(self, tenant_id: str, event: JobEvent) -> None:
        try:
            with self._engine.begin() as conn:
                conn.execute(
                    sa.insert(m.job_events).values(
                        tenant_id=tenant_id,
                        job_id=event.job_id,
                        seq=event.seq,
                        at=event.at,
                        kind=str(event.kind),
                        message=event.message,
                    )  # fmt: skip
                )
        except IntegrityError as exc:
            raise ValueError("Ya existe un evento con ese número de secuencia.") from exc

    def list_after(self, tenant_id: str, job_id: str, after_seq: int = 0) -> list[JobEvent]:
        stmt = (
            sa.select(m.job_events)
            .where(
                m.job_events.c.tenant_id == tenant_id, m.job_events.c.job_id == job_id, m.job_events.c.seq > after_seq
            )
            .order_by(m.job_events.c.seq)
        )
        return [
            JobEvent(job_id=r["job_id"], seq=r["seq"], at=r["at"], kind=EventKind(r["kind"]), message=r["message"])
            for r in self._all(stmt)
        ]


class SqlResults(_Repo):
    def save(self, tenant_id: str, job_id: str, result: dict[str, Any]) -> None:
        payload = json.dumps(result, ensure_ascii=False, separators=(",", ":"))
        with self._engine.begin() as conn:
            owner = conn.execute(
                sa.select(m.results.c.tenant_id).where(m.results.c.job_id == job_id)
            ).scalar_one_or_none()
            if owner is None:
                conn.execute(sa.insert(m.results).values(job_id=job_id, tenant_id=tenant_id, payload=payload))
            elif owner != tenant_id:
                raise ValueError("La evaluación pertenece a otra organización.")
            else:
                conn.execute(sa.update(m.results).where(m.results.c.job_id == job_id).values(payload=payload))

    def get(self, tenant_id: str, job_id: str) -> dict[str, Any] | None:
        r = self._one(
            sa.select(m.results.c.payload).where(m.results.c.tenant_id == tenant_id, m.results.c.job_id == job_id)
        )
        return json.loads(r["payload"]) if r else None


# ---------------------------------------------------------------- auditoría, proveedores y revisiones
class SqlAuditTrail(_Repo):
    @staticmethod
    def _to(r: Row) -> AuditEntry:
        return AuditEntry(
            tenant_id=r["tenant_id"], seq=r["seq"], at=r["at"], actor=r["actor"], action=r["action"],
            detail=r["detail"], prev_hash=r["prev_hash"], hash=r["hash"],
        )  # fmt: skip

    def append(self, entry: AuditEntry) -> None:
        try:
            with self._engine.begin() as conn:
                conn.execute(
                    sa.insert(m.audit_trail).values(
                        tenant_id=entry.tenant_id,
                        seq=entry.seq,
                        at=entry.at,
                        actor=entry.actor,
                        action=entry.action,
                        detail=entry.detail,
                        prev_hash=entry.prev_hash,
                        hash=entry.hash,
                    )  # fmt: skip
                )
        except IntegrityError as exc:
            raise ValueError("Ya existe un registro de auditoría con ese número de secuencia.") from exc

    def last(self, tenant_id: str) -> AuditEntry | None:
        r = self._one(
            sa.select(m.audit_trail)
            .where(m.audit_trail.c.tenant_id == tenant_id)
            .order_by(m.audit_trail.c.seq.desc())
            .limit(1)
        )
        return self._to(r) if r else None

    def list_for(self, tenant_id: str) -> list[AuditEntry]:
        stmt = sa.select(m.audit_trail).where(m.audit_trail.c.tenant_id == tenant_id).order_by(m.audit_trail.c.seq)
        return [self._to(r) for r in self._all(stmt)]


class SqlSuppliers(_Repo):
    @staticmethod
    def _to(r: Row) -> Supplier:
        return Supplier(
            id=r["id"], tenant_id=r["tenant_id"], name=r["name"], rif=r["rif"], location=r["location"],
            contact=r["contact"],
        )  # fmt: skip

    def save(self, supplier: Supplier) -> None:
        values = {
            "name": supplier.name,
            "rif": supplier.rif,
            "location": supplier.location,
            "contact": supplier.contact,
        }
        try:
            with self._engine.begin() as conn:
                self._upsert(conn, m.suppliers, supplier.id, supplier.tenant_id, values)
        except IntegrityError as exc:
            raise ValueError("Ya existe un proveedor con ese RIF.") from exc

    def _find(self, *conditions: Any) -> Supplier | None:
        r = self._one(sa.select(m.suppliers).where(*conditions).order_by(m.suppliers.c.id).limit(1))
        return self._to(r) if r else None

    def by_id(self, tenant_id: str, supplier_id: str) -> Supplier | None:
        return self._find(m.suppliers.c.tenant_id == tenant_id, m.suppliers.c.id == supplier_id)

    def by_rif(self, tenant_id: str, rif: str) -> Supplier | None:
        return self._find(m.suppliers.c.tenant_id == tenant_id, m.suppliers.c.rif == rif)

    def by_name(self, tenant_id: str, name: str) -> Supplier | None:
        return self._find(
            m.suppliers.c.tenant_id == tenant_id, sa.func.lower(m.suppliers.c.name) == name.strip().lower()
        )

    def list_for(self, tenant_id: str) -> list[Supplier]:
        stmt = (
            sa.select(m.suppliers)
            .where(m.suppliers.c.tenant_id == tenant_id)
            .order_by(m.suppliers.c.name, m.suppliers.c.id)
        )
        return [self._to(r) for r in self._all(stmt)]

    def add_record(self, record: SupplierRecord) -> None:
        with self._engine.begin() as conn:
            conn.execute(
                sa.insert(m.supplier_records).values(
                    tenant_id=record.tenant_id,
                    supplier_id=record.supplier_id,
                    job_id=record.job_id,
                    project_id=record.project_id,
                    proposal_id=record.proposal_id,
                    verdict=str(record.verdict),
                    reason=record.reason,
                    at=record.at,
                )  # fmt: skip
            )

    def records(self, tenant_id: str, supplier_id: str) -> list[SupplierRecord]:
        t = m.supplier_records
        stmt = sa.select(t).where(t.c.tenant_id == tenant_id, t.c.supplier_id == supplier_id).order_by(t.c.at, t.c.id)
        return [
            SupplierRecord(
                tenant_id=r["tenant_id"],
                supplier_id=r["supplier_id"],
                job_id=r["job_id"],
                project_id=r["project_id"],
                proposal_id=r["proposal_id"],
                verdict=Verdict(r["verdict"]),
                reason=r["reason"],
                at=r["at"],
            )  # fmt: skip
            for r in self._all(stmt)
        ]


class SqlReviews(_Repo):
    def add(self, review: Review) -> None:
        payload = json.dumps(review.payload, ensure_ascii=False) if review.payload is not None else None
        with self._engine.begin() as conn:
            conn.execute(
                sa.insert(m.reviews).values(
                    id=review.id,
                    tenant_id=review.tenant_id,
                    job_id=review.job_id,
                    proposal_id=review.proposal_id,
                    author_id=review.author_id,
                    kind=str(review.kind),
                    text=review.text,
                    created=review.created,
                    payload=payload,
                )  # fmt: skip
            )

    def list_for_job(self, tenant_id: str, job_id: str) -> list[Review]:
        t = m.reviews
        stmt = sa.select(t).where(t.c.tenant_id == tenant_id, t.c.job_id == job_id).order_by(t.c.created, t.c.id)
        return [
            Review(
                id=r["id"],
                tenant_id=r["tenant_id"],
                job_id=r["job_id"],
                proposal_id=r["proposal_id"],
                author_id=r["author_id"],
                kind=ReviewKind(r["kind"]),
                text=r["text"],
                created=r["created"],
                payload=json.loads(r["payload"]) if r["payload"] is not None else None,
            )  # fmt: skip
            for r in self._all(stmt)
        ]
