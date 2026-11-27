import pytest

from evaluador.application.use_cases.export_report import (
    ExportReport,
    RenderedReport,
    ReportFormat,
    ReportInput,
)
from evaluador.domain.errors import InvalidData, NotFound, PermissionDenied
from evaluador.domain.identity import Role, User
from tests.adapters._report_fixtures import full_result


class FakeRenderer:
    def __init__(self, ext: str) -> None:
        self.ext, self.calls = ext, []

    def render(self, data: ReportInput) -> RenderedReport:
        self.calls.append(data)
        return RenderedReport(content=f"x-{self.ext}".encode(), media_type="application/x-test", extension=self.ext)


class FakeSource:
    def __init__(self, result=None) -> None:
        self.result, self.calls = result, []

    def get(self, tenant_id, job_id):
        self.calls.append((tenant_id, job_id))
        return self.result


class FakeNames:
    def __init__(self, name="Lab: 11/PCs ñ ../x") -> None:
        self.name = name

    def name_of(self, tenant_id, project_id):
        return self.name


class FakeAudit:
    def __init__(self) -> None:
        self.events = []

    def register(self, *, tenant_id, actor, action, detail=""):
        self.events.append((tenant_id, actor, action, detail))


def user(role: Role = Role.EVALUATOR, tenant="t-alfa") -> User:
    return User(id=f"{tenant}-{role}", tenant_id=tenant, email="a@b.test", password_hash="x", role=role)


def build(source=None, names=None):
    renderers = {f: FakeRenderer(f.value) for f in ReportFormat}
    audit = FakeAudit()
    uc = ExportReport(source or FakeSource(full_result()), names or FakeNames(), renderers, audit)
    return uc, renderers, audit


def test_exports_with_safe_ascii_filename_and_audits():
    uc, renderers, audit = build()
    out = uc.execute(user(), "11111111-1111-1111-1111-111111111111", "pdf")
    assert out.content == b"x-pdf" and out.media_type == "application/x-test"
    assert out.filename.endswith(".pdf") and out.filename.isascii()
    assert "/" not in out.filename and ".." not in out.filename and " " not in out.filename and ":" not in out.filename
    assert "20261126" in out.filename
    assert audit.events == [
        ("t-alfa", "t-alfa-evaluator", "report_exported", "11111111-1111-1111-1111-111111111111:pdf")
    ]
    assert renderers[ReportFormat.PDF].calls[0].project_name == "Lab: 11/PCs ñ ../x"


def test_format_is_case_insensitive_and_unknown_format_is_invalid_data_in_spanish():
    uc, _, audit = build()
    assert uc.execute(user(), "id", "XLSX").filename.endswith(".xlsx")
    with pytest.raises(InvalidData, match="Formato"):
        uc.execute(user(), "id", "docx")
    with pytest.raises(InvalidData):
        uc.execute(user(), "id", "")
    assert len(audit.events) == 1  # lo inválido no se audita como exportado


def test_requires_view_results_permission():
    uc, _, audit = build()
    with pytest.raises(PermissionDenied):
        uc.execute(user(Role.LOADER), "id", "pdf")
    assert audit.events == []
    assert uc.execute(user(Role.AUDITOR), "id", "csv")  # el auditor sí puede ver resultados


def test_source_is_always_queried_with_the_actor_tenant():
    source = FakeSource(full_result())
    uc, _, _ = build(source)
    uc.execute(user(tenant="t-beta"), "abc", "md")
    assert source.calls == [("t-beta", "abc")]


def test_unknown_evaluation_is_not_found_without_audit():
    uc, _, audit = build(FakeSource(None))
    with pytest.raises(NotFound, match="evaluación"):
        uc.execute(user(), "id", "pdf")
    assert audit.events == []


def test_missing_project_name_falls_back_to_a_generic_filename():
    uc, _, _ = build(names=FakeNames(None))
    assert uc.execute(user(), "id", "csv").filename.startswith("report-")
