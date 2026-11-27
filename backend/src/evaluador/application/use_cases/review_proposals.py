"""Human verification of the AI's result: a person says yes or no to each proposal, with the audit trail."""

from __future__ import annotations

from evaluador.application.ports.records import Records
from evaluador.application.ports.salida import Auditoria, ProyectoRepositorio, Reloj
from evaluador.application.use_cases.evaluate_project import ProjectEvaluationRepository
from evaluador.domain.errores import DatoInvalido, NoEncontrado, TransicionInvalida
from evaluador.domain.evaluacion import Veredicto
from evaluador.domain.identidad import Permiso, Usuario
from evaluador.domain.project_evaluation import ProjectEvaluation, ReviewDecision
from evaluador.domain.proyecto import EstadoProyecto

MIN_JUSTIFICATION = 10
_CLOSED = frozenset({EstadoProyecto.ADJUDICADO, EstadoProyecto.CERRADO})


class ReviewProposals:
    def __init__(
        self,
        *,
        projects: ProyectoRepositorio,
        evaluations: ProjectEvaluationRepository,
        decisions: Records[ReviewDecision],
        clock: Reloj,
        audit: Auditoria,
    ) -> None:
        self._projects, self._evaluations, self._decisions = projects, evaluations, decisions
        self._clock, self._audit = clock, audit

    def _evaluation(self, actor: Usuario, project_id: str) -> ProjectEvaluation:
        if self._projects.por_id(actor.tenant_id, project_id) is None:
            raise NoEncontrado("Proyecto no encontrado.")
        evaluation = self._evaluations.por_id(actor.tenant_id, project_id)
        if evaluation is None:
            raise NoEncontrado("El proyecto aún no tiene una evaluación registrada.")
        return evaluation

    def current(self, actor: Usuario, project_id: str) -> list[ReviewDecision]:
        """Only decisions about the reading that is on screen: a re-evaluated proposal must be verified again."""
        actor.exigir(Permiso.VER_RESULTADOS)
        readings = {i.proposal_id: i.evaluated_at for i in self._evaluation(actor, project_id).items}
        return [
            d
            for d in self._decisions.listar(actor.tenant_id)
            if d.project_id == project_id
            and d.proposal_id in readings
            and d.reviewed_reading == readings[d.proposal_id]
        ]

    def decide(
        self, actor: Usuario, project_id: str, proposal_id: str, approved: bool, comment: str = ""
    ) -> ReviewDecision:
        actor.exigir(Permiso.ANOTAR_REVISION)
        evaluation = self._evaluation(actor, project_id)
        project = self._projects.por_id(actor.tenant_id, project_id)
        if project is not None and project.estado in _CLOSED:
            raise TransicionInvalida("El proyecto ya está adjudicado o cerrado.")
        item = next((i for i in evaluation.items if i.proposal_id == proposal_id), None)
        if item is None:
            raise NoEncontrado("Esa propuesta no está en la evaluación.")
        comment = " ".join(comment.split())
        agrees = approved == (item.verdict == Veredicto.VALIDA.value)
        if not agrees and len(comment) < MIN_JUSTIFICATION:
            raise DatoInvalido("Su decisión difiere de la IA: explique por qué (mínimo 10 caracteres).")
        decision = ReviewDecision(
            id=f"{project_id}.{proposal_id}",
            tenant_id=actor.tenant_id,
            project_id=project_id,
            proposal_id=proposal_id,
            approved=approved,
            comment=comment,
            decided_by=actor.correo,
            creado=self._clock.ahora(),
            reviewed_reading=item.evaluated_at,
        )
        self._decisions.guardar(decision)
        self._audit.registrar(
            tenant_id=actor.tenant_id,
            actor=actor.id,
            accion="review_decision",
            detalle=f"{project_id}:{item.filename}:{'si' if approved else 'no'}",
        )
        return decision
