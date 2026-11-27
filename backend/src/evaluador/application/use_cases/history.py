"""What the organisation remembers: past evaluation runs of a project and each supplier's background."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, replace
from datetime import datetime

from evaluador.application.ports.salida import Collection, ProyectoRepositorio
from evaluador.application.use_cases.evaluate_project import ProjectEvaluationRepository
from evaluador.application.use_cases.gestion import Gestion
from evaluador.domain.errores import NoEncontrado
from evaluador.domain.gestion import Proveedor
from evaluador.domain.identidad import Permiso, Usuario
from evaluador.domain.project_evaluation import ProjectEvaluation
from evaluador.domain.supplier_history import SupplierRecord, build_directory


class ArchivingEvaluations:
    """The current evaluation of each project, keeping an untouched copy of every run.

    Only a new run is archived: removing a file from the current result keeps its date, so it adds nothing.
    """

    def __init__(
        self,
        current: Collection[ProjectEvaluation],
        runs: Collection[ProjectEvaluation],
        new_id: Callable[[], str],
    ) -> None:
        self._current, self._runs, self._new_id = current, runs, new_id

    def guardar(self, entidad: ProjectEvaluation) -> None:
        previous = self._current.por_id(entidad.tenant_id, entidad.id)
        if previous is None or previous.creado != entidad.creado:
            self._runs.guardar(replace(entidad, id=self._new_id()))
        self._current.guardar(entidad)

    def por_id(self, tenant_id: str, entidad_id: str) -> ProjectEvaluation | None:
        return self._current.por_id(tenant_id, entidad_id)

    def listar(self, tenant_id: str) -> list[ProjectEvaluation]:
        return self._current.listar(tenant_id)

    def eliminar(self, tenant_id: str, entidad_id: str) -> None:
        self._current.eliminar(tenant_id, entidad_id)

    def runs_of(self, tenant_id: str, project_id: str) -> list[ProjectEvaluation]:
        mine = (r for r in self._runs.listar(tenant_id) if r.project_id == project_id)
        return sorted(mine, key=lambda r: r.creado, reverse=True)

    def forget_runs(self, tenant_id: str, project_id: str) -> None:
        for run in self.runs_of(tenant_id, project_id):
            self._runs.eliminar(tenant_id, run.id)


@dataclass(frozen=True, slots=True)
class RunSummary:
    id: str
    evaluated_at: datetime
    evaluated_by: str
    proposals: int
    valid: int
    recommended: str | None


class EvaluationHistory:
    def __init__(self, projects: ProyectoRepositorio, evaluations: ArchivingEvaluations, management: Gestion) -> None:
        self._projects, self._evaluations, self._management = projects, evaluations, management

    def _runs(self, actor: Usuario, project_id: str) -> list[ProjectEvaluation]:
        actor.exigir(Permiso.VER_RESULTADOS)
        if self._projects.por_id(actor.tenant_id, project_id) is None:
            raise NoEncontrado("Proyecto no encontrado.")
        return self._evaluations.runs_of(actor.tenant_id, project_id)

    def list(self, actor: Usuario, project_id: str) -> list[RunSummary]:
        summaries = []
        for run in self._runs(actor, project_id):
            valid = [i for i in run.items if i.verdict == "valida"]
            summaries.append(RunSummary(
                run.id, run.creado, self._management.correo_de(run.tenant_id, run.evaluated_by), len(run.items),
                len(valid), valid[0].filename if valid else None,
            ))  # fmt: skip
        return summaries

    def run(self, actor: Usuario, project_id: str, run_id: str) -> ProjectEvaluation:
        found = next((r for r in self._runs(actor, project_id) if r.id == run_id), None)
        if found is None:
            raise NoEncontrado("Esa evaluación anterior no existe.")
        return found


@dataclass(frozen=True, slots=True)
class SupplierDirectory:
    records: list[SupplierRecord]
    restricted: bool  # the role may see the records but not the results of the evaluations


class GetSupplierDirectory:
    def __init__(
        self,
        projects: ProyectoRepositorio,
        evaluations: ProjectEvaluationRepository,
        suppliers: Collection[Proveedor],
    ) -> None:
        self._projects, self._evaluations, self._suppliers = projects, evaluations, suppliers

    def execute(self, actor: Usuario) -> SupplierDirectory:
        actor.exigir(Permiso.VER_ESTADO)
        restricted = not actor.tiene(Permiso.VER_RESULTADOS)
        evaluations = [] if restricted else self._evaluations.listar(actor.tenant_id)
        names = {p.id: p.nombre for p in self._projects.listar(actor.tenant_id)}
        return SupplierDirectory(
            build_directory(self._suppliers.listar(actor.tenant_id), evaluations, names), restricted
        )
