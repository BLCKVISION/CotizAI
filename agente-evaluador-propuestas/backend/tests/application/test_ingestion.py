import hashlib
import io
import itertools
from datetime import UTC, datetime

import pytest
from openpyxl import Workbook

from evaluador.adapters.outbound.extraction.reader import detect_type, type_by_extension
from evaluador.adapters.outbound.memory.file_store import InMemoryFileStore
from evaluador.adapters.outbound.memory.proposals import InMemoryProposals
from evaluador.adapters.outbound.memory.repositories import InMemoryProjects
from evaluador.application.use_cases.ingestion import (
    MAX_PROPOSALS_PER_PROJECT,
    DeleteProposal,
    ListProposals,
    UploadProposal,
)
from evaluador.domain.errors import InvalidData, InvalidTransition, NotFound, PermissionDenied
from evaluador.domain.identity import Role, User
from evaluador.domain.project import Project, ProjectState

PDF = b"%PDF-1.4\n" + b"contenido\n" * 10
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
JPG = b"\xff\xd8\xff" + b"\x00" * 20


def xlsx() -> bytes:
    buf = io.BytesIO()
    Workbook().save(buf)
    return buf.getvalue()


class Audit:
    def __init__(self):
        self.events = []

    def register(self, *, tenant_id, actor, action, detail=""):
        self.events.append((tenant_id, actor, action, detail))


class Ids:
    def __init__(self):
        self._c = itertools.count(1)

    def new(self):
        return f"00000000-0000-0000-0000-{next(self._c):012d}"


class Clock:
    def now(self):
        return datetime(2026, 1, 1, tzinfo=UTC)


def user(tenant="t1", role=Role.LOADER, uid="u1"):
    return User(id=uid, tenant_id=tenant, email=f"{uid}@x.test", password_hash="h", role=role)


@pytest.fixture
def env():
    projects, proposals, files, audit, ids = (
        InMemoryProjects(),
        InMemoryProposals(),
        InMemoryFileStore(),
        Audit(),
        Ids(),
    )
    p = Project.create(
        id="p1",
        tenant_id="t1",
        name="Lab",
        requirement="r",
        location="l",
        reference_budget=None,
        created_by="u1",
        now=Clock().now(),
    )
    projects.save(p)
    return type(
        "Env",
        (),
        dict(
            projects=projects,
            proposals=proposals,
            files=files,
            audit=audit,
            ids=ids,
            upload=UploadProposal(projects, proposals, files, ids, Clock(), audit),
            list=ListProposals(projects, proposals),
            delete=DeleteProposal(projects, proposals, files, audit),
        ),
    )


# ---------- detección de tipo (API pública de reader) ----------
def test_detect_type_by_content_and_extension():
    assert detect_type(PDF) == "pdf" and detect_type(PNG) == "png" and detect_type(JPG) == "jpeg"
    assert detect_type(b"MZ....") is None
    assert type_by_extension("a.PDF") == "pdf" and type_by_extension("a.jpeg") == "jpeg"
    assert type_by_extension("a.xlsm") is None and type_by_extension("sin_extension") is None


# ---------- carga ----------
def test_upload_stores_encrypted_copy_and_registers(env):
    pr = env.upload.execute(user(), "p1", "Propuesta_A.pdf", PDF)
    assert pr.sha256 == hashlib.sha256(PDF).hexdigest() and pr.size_bytes == len(PDF)
    assert pr.filename == "Propuesta_A.pdf" and pr.project_id == "p1" and pr.tenant_id == "t1"
    assert env.files.get("t1", pr.storage_key) == PDF
    assert pr.storage_key != pr.id and "Propuesta_A" not in pr.storage_key  # clave opaca
    assert ("t1", "u1", "proposal_uploaded", pr.id) in env.audit.events


def test_accepts_all_allowed_types(env):
    for name, data in [("a.pdf", PDF), ("b.xlsx", xlsx()), ("c.png", PNG), ("d.jpg", JPG), ("e.jpeg", JPG + b"2")]:
        env.upload.execute(user(), "p1", name, data)
    assert len(env.list.execute(user(), "p1")) == 5


def test_type_is_validated_by_content_not_extension(env):
    with pytest.raises(InvalidData):
        env.upload.execute(user(), "p1", "falso.pdf", b"MZ\x90\x00 ejecutable")
    with pytest.raises(InvalidData):
        env.upload.execute(user(), "p1", "foto.png", PDF)  # contenido PDF con extensión png


@pytest.mark.parametrize("name", ["macro.xlsm", "viejo.xls", "nota.txt", "run.exe", "sin_extension", "doc.pdf.exe"])
def test_rejects_disallowed_extensions(env, name):
    with pytest.raises(InvalidData):
        env.upload.execute(user(), "p1", name, PDF)


def test_rejects_empty_and_oversized(env):
    with pytest.raises(InvalidData):
        env.upload.execute(user(), "p1", "a.pdf", b"")
    with pytest.raises(InvalidData):
        env.upload.execute(user(), "p1", "a.pdf", PDF + b"x" * (25 * 1024 * 1024))


def test_same_content_is_idempotent(env):
    a = env.upload.execute(user(), "p1", "A.pdf", PDF)
    b = env.upload.execute(user(), "p1", "Otro_nombre.pdf", PDF)
    assert a.id == b.id and len(env.list.execute(user(), "p1")) == 1


def test_same_content_in_other_project_is_a_separate_proposal(env):
    env.projects.save(
        Project.create(
            id="p2",
            tenant_id="t1",
            name="Otro",
            requirement="r",
            location="l",
            reference_budget=None,
            created_by="u1",
            now=Clock().now(),
        )
    )
    a = env.upload.execute(user(), "p1", "A.pdf", PDF)
    b = env.upload.execute(user(), "p2", "A.pdf", PDF)
    assert a.id != b.id


def test_name_collision_without_extension_is_rejected(env):
    env.upload.execute(user(), "p1", "A.pdf", PDF)
    with pytest.raises(InvalidData) as e:
        env.upload.execute(user(), "p1", "a.xlsx", xlsx())  # mismo id de ranking "a"/"A"
    assert "nombre" in str(e.value).lower()


@pytest.mark.parametrize(
    ("raw", "clean"),
    [("../../etc/passwd.pdf", "passwd.pdf"), ("C:\\Users\\x\\Prop.pdf", "Prop.pdf"), ("a\x00b\x1f.pdf", "ab.pdf"),
     ("  espacios  .pdf", "espacios.pdf"), ("dir/sub/Z.PDF", "Z.PDF")],
)  # fmt: skip
def test_filename_is_sanitized_to_basename(env, raw, clean):
    assert env.upload.execute(user(), "p1", raw, PDF).filename == clean


@pytest.mark.parametrize("raw", ["", "   ", ".pdf", "/", "..", ".hidden.pdf", "a" * 300 + ".pdf"])
def test_unusable_filenames_are_rejected(env, raw):
    with pytest.raises(InvalidData):
        env.upload.execute(user(), "p1", raw, PDF)


def test_max_proposals_per_project(env):
    for i in range(MAX_PROPOSALS_PER_PROJECT):
        env.upload.execute(user(), "p1", f"P{i}.pdf", PDF + str(i).encode())
    with pytest.raises(InvalidData):
        env.upload.execute(user(), "p1", "extra.pdf", PDF + b"extra")
    assert MAX_PROPOSALS_PER_PROJECT == 20


# ---------- permisos, tenant y estado ----------
@pytest.mark.parametrize("role", [Role.EVALUATOR, Role.APPROVER, Role.AUDITOR])
def test_only_loader_can_upload(env, role):
    with pytest.raises(PermissionDenied):
        env.upload.execute(user(role=role), "p1", "A.pdf", PDF)


def test_other_tenant_sees_not_found(env):
    with pytest.raises(NotFound):
        env.upload.execute(user(tenant="t2"), "p1", "A.pdf", PDF)
    with pytest.raises(NotFound):
        env.list.execute(user(tenant="t2"), "p1")


def test_only_receiving_projects_accept_uploads(env):
    env.projects.save(env.projects.by_id("t1", "p1").transition(ProjectState.EVALUATING))
    with pytest.raises(InvalidTransition):
        env.upload.execute(user(), "p1", "A.pdf", PDF)


def test_unknown_project(env):
    with pytest.raises(NotFound):
        env.upload.execute(user(), "nope", "A.pdf", PDF)


# ---------- listar y borrar ----------
def test_list_requires_view_state_and_is_tenant_scoped(env):
    env.upload.execute(user(), "p1", "A.pdf", PDF)
    assert [p.filename for p in env.list.execute(user(role=Role.AUDITOR, uid="u9"), "p1")] == ["A.pdf"]


def test_delete_removes_record_and_file_and_audits(env):
    pr = env.upload.execute(user(), "p1", "A.pdf", PDF)
    env.delete.execute(user(), "p1", pr.id)
    assert env.list.execute(user(), "p1") == []
    with pytest.raises(NotFound):
        env.files.get("t1", pr.storage_key)
    assert ("t1", "u1", "proposal_deleted", pr.id) in env.audit.events


def test_delete_unknown_or_foreign_proposal_is_not_found(env):
    pr = env.upload.execute(user(), "p1", "A.pdf", PDF)
    with pytest.raises(NotFound):
        env.delete.execute(user(), "p1", "nope")
    with pytest.raises(NotFound):
        env.delete.execute(user(tenant="t2"), "p1", pr.id)


def test_delete_only_while_receiving_and_with_permission(env):
    pr = env.upload.execute(user(), "p1", "A.pdf", PDF)
    with pytest.raises(PermissionDenied):
        env.delete.execute(user(role=Role.APPROVER), "p1", pr.id)
    env.projects.save(env.projects.by_id("t1", "p1").transition(ProjectState.EVALUATING))
    with pytest.raises(InvalidTransition):
        env.delete.execute(user(), "p1", pr.id)
