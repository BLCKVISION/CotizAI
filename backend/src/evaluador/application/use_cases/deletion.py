"""Deleting uploaded files and whole projects, with everything derived from them.

The audit trail is never touched: it keeps who deleted what, with the fingerprint of each file.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import replace

from evaluador.application.ports.salida import Auditoria, ProyectoRepositorio
from evaluador.application.use_cases.gestion import Gestion
from evaluador.domain.errores import NoEncontrado, TransicionInvalida
from evaluador.domain.gestion import Propuesta
from evaluador.domain.identidad import Permiso, Usuario
from evaluador.domain.proyecto import EstadoProyecto, Proyecto

# Called with (tenant_id, sha256) so that text extracted from a deleted file does not stay in memory.
ForgetText = Callable[[str, str], None]


def _project(projects: ProyectoRepositorio, actor: Usuario, project_id: str) -> Proyecto:
    project = projects.por_id(actor.tenant_id, project_id)
    if project is None:
        raise NoEncontrado("Proyecto no encontrado.")
    return project


def _require_deletable(project: Proyecto) -> None:
    if project.estado is EstadoProyecto.EN_EVALUACION:
        raise TransicionInvalida("Espere a que termine la evaluación en curso.")
    if project.was_awarded:
        raise TransicionInvalida("Un proyecto adjudicado es el respaldo de una compra y no se puede eliminar.")


class DeleteProposal:
    def __init__(
        self, *, projects: ProyectoRepositorio, management: Gestion, evaluations, decisions, audit: Auditoria,
        forget_text: ForgetText,
    ) -> None:  # fmt: skip
        self._projects, self._management = projects, management
        self._evaluations, self._decisions = evaluations, decisions
        self._audit, self._forget_text = audit, forget_text

    def execute(self, actor: Usuario, project_id: str, proposal_id: str) -> None:
        actor.exigir(Permiso.CARGAR_DOCUMENTOS)
        project = _project(self._projects, actor, project_id)
        _require_deletable(project)
        if project.estado is EstadoProyecto.CERRADO:
            raise TransicionInvalida("El proyecto está cerrado: sus archivos ya no se modifican.")
        proposal: Propuesta = self._management.eliminar_propuesta(actor, project_id, proposal_id)
        self._forget_text(actor.tenant_id, proposal.sha256)
        self._drop_result(actor, project, proposal_id, proposal.archivo)

    def _drop_result(self, actor: Usuario, project: Proyecto, proposal_id: str, filename: str) -> None:
        self._decisions.eliminar(actor.tenant_id, f"{project.id}.{proposal_id}")
        evaluation = self._evaluations.por_id(actor.tenant_id, project.id)
        if evaluation is None:
            return
        items = tuple(i for i in evaluation.items if i.proposal_id != proposal_id)
        if items:
            self._evaluations.guardar(replace(
                evaluation,
                items=items,
                ranking=tuple(p for p in evaluation.ranking if p != proposal_id),
                warnings=tuple(w for w in evaluation.warnings if filename not in w),
            ))  # fmt: skip
            return
        # Nothing evaluated is left: the project goes back to receiving proposals.
        self._evaluations.eliminar(actor.tenant_id, project.id)
        if project.estado is EstadoProyecto.EN_REVISION_DEL_COMITE:
            self._projects.guardar(project.reopened_for_reception())
            self._audit.registrar(
                tenant_id=actor.tenant_id, actor=actor.id, accion="proyecto_transicion",
                detalle=f"{project.id}:{project.estado}->{EstadoProyecto.EN_RECEPCION}",
            )  # fmt: skip


class DeleteProject:
    def __init__(
        self, *, projects: ProyectoRepositorio, proposals, notes, evaluations, decisions, store, audit: Auditoria,
        forget_text: ForgetText,
    ) -> None:  # fmt: skip
        self._projects, self._proposals, self._notes = projects, proposals, notes
        self._evaluations, self._decisions, self._store = evaluations, decisions, store
        self._audit, self._forget_text = audit, forget_text

    def execute(self, actor: Usuario, project_id: str) -> None:
        actor.exigir(Permiso.CREAR_PROYECTO)
        project = _project(self._projects, actor, project_id)
        _require_deletable(project)
        # The project goes last: if anything fails, it is still listed and deleting it can be retried.
        for proposal in [p for p in self._proposals.listar(actor.tenant_id) if p.proyecto_id == project_id]:
            self._store.erase_file(actor.tenant_id, proposal.id)
            self._proposals.eliminar(actor.tenant_id, proposal.id)
            self._forget_text(actor.tenant_id, proposal.sha256)
            self._audit.registrar(
                tenant_id=actor.tenant_id, actor=actor.id, accion="propuesta_eliminada",
                detalle=f"{project_id}:{proposal.archivo}:{proposal.sha256}",
            )  # fmt: skip
        for decision in [d for d in self._decisions.listar(actor.tenant_id) if d.project_id == project_id]:
            self._decisions.eliminar(actor.tenant_id, decision.id)
        for note in [n for n in self._notes.listar(actor.tenant_id) if n.proyecto_id == project_id]:
            self._notes.eliminar(actor.tenant_id, note.id)
        self._evaluations.eliminar(actor.tenant_id, project_id)
        self._projects.eliminar(actor.tenant_id, project_id)
        self._audit.registrar(
            tenant_id=actor.tenant_id, actor=actor.id, accion="proyecto_eliminado",
            detalle=f"{project_id}:{project.nombre}",
        )  # fmt: skip
