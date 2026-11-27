"""Tools of the assistant. All read-only.

Security rules of this module:
- No tool accepts an organisation: it always comes from the authenticated actor.
- Each tool goes through the same use cases as the API, so permissions and tenant isolation are the same.
- Arguments are written by a model, so they are validated strictly before use.
- Results are neutralised because they carry text taken from supplier documents.
"""

from __future__ import annotations

import json
import logging
from collections import Counter
from collections.abc import Callable
from dataclasses import asdict, dataclass, field
from decimal import Decimal
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from evaluador.application.ports.assistant import MarketPriceLookup, ReportFormat, ReportRenderer, ToolCall, ToolSpec
from evaluador.application.use_cases.evaluate_project import GetProjectEvaluation
from evaluador.application.use_cases.gestion import Gestion
from evaluador.application.use_cases.proyectos import ListarProyectos, ObtenerProyecto
from evaluador.application.use_cases.review_proposals import ReviewProposals
from evaluador.domain.assistant.analysis import comparable_cost, compare, recommend
from evaluador.domain.assistant.guardrails import neutralise_tree, sanitise_search_query
from evaluador.domain.errores import DatoInvalido, ErrorDeDominio, NoEncontrado
from evaluador.domain.identidad import Permiso, Usuario
from evaluador.domain.moneda import normalize_currency
from evaluador.domain.project_evaluation import ProjectEvaluation, ProposalEvaluationItem
from evaluador.domain.proyecto import Proyecto

_log = logging.getLogger("evaluador.assistant")
MAX_RESULT_CHARS = 24_000
MAX_SEARCHES_PER_TURN = 5
MAX_REPORTS_PER_TURN = 3
_MAX_PROJECTS = 40

Id = Annotated[str, Field(pattern=r"^[A-Za-z0-9-]{1,64}$")]


class _Args(BaseModel):
    model_config = ConfigDict(extra="forbid")


class NoArgs(_Args):
    pass


class ProjectArgs(_Args):
    project_id: Id


class ProposalRef(_Args):
    project_id: Id
    proposal_id: Id


class CompareProposalsArgs(_Args):
    project_id: Id | None = Field(None, description="Compara todas las propuestas evaluadas de este proyecto")
    proposals: list[ProposalRef] = Field(
        default_factory=list, max_length=10, description="O bien propuestas concretas, incluso de proyectos distintos"
    )


class CompareProjectsArgs(_Args):
    project_ids: list[Id] = Field(min_length=2, max_length=8)


class MarketPriceArgs(_Args):
    product: str = Field(min_length=4, max_length=200, description="Solo marca, modelo y especificaciones")
    currency: str = Field("USD", min_length=1, max_length=10)


class ReportArgs(_Args):
    kind: Literal["evaluation", "comparison", "recommendations", "portfolio"] = Field(
        description="evaluation: informe auditable de un proyecto; comparison: propuestas lado a lado; "
        "recommendations: siguientes pasos de un proyecto; portfolio: todos los presupuestos de la organización"
    )
    project_id: Id | None = None
    format: ReportFormat = Field("pdf", description="pdf salvo que pidan Excel (xlsx), Markdown (md) o CSV")


@dataclass(frozen=True, slots=True)
class GeneratedReport:
    filename: str
    format: str
    content: bytes


@dataclass(slots=True)
class TurnArtifacts:
    """What one turn produced besides text. Kept in code: the model cannot add to it."""

    reports: list[GeneratedReport] = field(default_factory=list)
    links: list[str] = field(default_factory=list)
    tools_used: list[str] = field(default_factory=list)
    evidence: list[str] = field(default_factory=list)  # tool results, used to check the figures of the answer
    searches: int = 0


def _json(value: Any) -> str:
    def encode(item: Any) -> str:
        if isinstance(item, Decimal):
            return format(item, "f")
        return item.isoformat() if hasattr(item, "isoformat") else str(item)

    return json.dumps(value, ensure_ascii=False, default=encode)


@dataclass(frozen=True, slots=True)
class _Tool:
    name: str
    description: str
    args: type[_Args]
    permission: Permiso
    run: Callable[[Usuario, Any, TurnArtifacts], Any]


class AssistantTools:
    def __init__(
        self,
        *,
        list_projects: ListarProyectos,
        get_project: ObtenerProyecto,
        get_evaluation: GetProjectEvaluation,
        management: Gestion,
        reviews: ReviewProposals,
        renderer: ReportRenderer,
        market: MarketPriceLookup | None = None,
        organisation_name: Callable[[str], str] = lambda _: "",
    ) -> None:
        self._list, self._project, self._evaluation = list_projects, get_project, get_evaluation
        self._management, self._reviews, self._renderer = management, reviews, renderer
        self._market, self._organisation_name = market, organisation_name
        tools = [
            _Tool("list_projects", "Lista los proyectos de la organización con su estado y presupuesto referencial.",
                  NoArgs, Permiso.VER_ESTADO, self._list_projects),
            _Tool("get_project", "Requerimiento, presupuesto, propuestas cargadas y notas de un proyecto.",
                  ProjectArgs, Permiso.VER_ESTADO, self._get_project),
            _Tool("get_evaluation", "Ranking, veredictos, puntajes, costos paso a paso, hallazgos, líneas cotizadas "
                  "y verificaciones humanas de la evaluación de un proyecto.",
                  ProjectArgs, Permiso.VER_RESULTADOS, self._get_evaluation),
            _Tool("compare_proposals", "Compara costos y resultados de propuestas, con diferencias ya calculadas.",
                  CompareProposalsArgs, Permiso.VER_RESULTADOS, self._compare_proposals),
            _Tool("compare_projects", "Compara los presupuestos de varios proyectos y su mejor propuesta válida.",
                  CompareProjectsArgs, Permiso.VER_RESULTADOS, self._compare_projects),
            _Tool("get_recommendations", "Siguientes pasos que se desprenden de lo registrado en un proyecto.",
                  ProjectArgs, Permiso.VER_RESULTADOS, self._get_recommendations),
            _Tool("list_suppliers", "Proveedores registrados por la organización.",
                  NoArgs, Permiso.VER_ESTADO, self._list_suppliers),
            _Tool("generate_report", "Genera un reporte descargable (PDF, Excel, Markdown o CSV). Solo si lo piden.",
                  ReportArgs, Permiso.VER_RESULTADOS, self._generate_report),
        ]  # fmt: skip
        if market is not None:
            tools.append(
                _Tool("search_market_price", "Busca en la web un precio unitario de referencia, con sus fuentes.",
                      MarketPriceArgs, Permiso.VER_RESULTADOS, self._search_market_price)
            )  # fmt: skip
        self._tools = {t.name: t for t in tools}

    def specs(self, actor: Usuario) -> list[ToolSpec]:
        """A tool the role cannot use is not even offered."""
        return [
            ToolSpec(t.name, t.description, t.args.model_json_schema())
            for t in self._tools.values()
            if actor.tiene(t.permission)
        ]

    def run(self, actor: Usuario, call: ToolCall, artifacts: TurnArtifacts) -> str:
        tool = self._tools.get(call.name)
        if tool is None:
            return _json({"error": "Herramienta desconocida."})
        try:
            actor.exigir(tool.permission)
            args = tool.args.model_validate_json(call.arguments or "{}")
            result = tool.run(actor, args, artifacts)
        except ValidationError as exc:
            fields = sorted({".".join(str(p) for p in e["loc"]) or "argumentos" for e in exc.errors()})
            return _json({"error": f"Argumentos no válidos: {', '.join(fields)}."})
        except ErrorDeDominio as exc:  # includes "not found", which also covers other organisations
            return _json({"error": str(exc)})
        except Exception as exc:  # noqa: BLE001 - a failing tool must not end the conversation
            _log.warning("assistant_tool_failed", extra={"herramienta": tool.name, "tipo": type(exc).__name__})
            return _json({"error": "La herramienta falló. No hay datos disponibles."})
        artifacts.tools_used.append(tool.name)
        text = _json(neutralise_tree(json.loads(_json(result))))
        if len(text) > MAX_RESULT_CHARS:
            text = text[:MAX_RESULT_CHARS] + "… [resultado recortado: pida un proyecto o propuesta concreta]"
        artifacts.evidence.append(text)
        return text

    # ---------- helpers ----------
    def _maybe_evaluation(self, actor: Usuario, project_id: str) -> ProjectEvaluation | None:
        try:
            return self._evaluation.execute(actor, project_id)
        except NoEncontrado:
            return None

    @staticmethod
    def _summary(project: Proyecto) -> dict[str, Any]:
        return {
            "project_id": project.id,
            "name": project.nombre,
            "status": project.estado.value,
            "location": project.ubicacion,
            "reference_budget": project.presupuesto_referencial,
            "currency": project.moneda,
            "created": project.creado,
        }

    def _entry(self, actor: Usuario, project_id: str) -> tuple[Proyecto, ProjectEvaluation]:
        project = self._project.ejecutar(actor, project_id)
        return project, self._evaluation.execute(actor, project_id)

    def _comparison_entries(
        self, actor: Usuario, project_id: str | None, refs: list[ProposalRef]
    ) -> list[tuple[Proyecto, ProposalEvaluationItem]]:
        if refs:
            entries = []
            for ref in refs:
                project, evaluation = self._entry(actor, ref.project_id)
                item = next((i for i in evaluation.items if i.proposal_id == ref.proposal_id), None)
                if item is None:
                    raise NoEncontrado("Una de las propuestas no está en la evaluación de ese proyecto.")
                entries.append((project, item))
        elif project_id:
            project, evaluation = self._entry(actor, project_id)
            entries = [(project, item) for item in evaluation.items]
        else:
            raise DatoInvalido("Indique un proyecto o las propuestas a comparar.")
        if len(entries) < 2:
            raise DatoInvalido("Se necesitan al menos dos propuestas evaluadas para comparar.")
        return entries

    def _portfolio_row(self, actor: Usuario, project: Proyecto) -> dict[str, Any]:
        evaluation = self._maybe_evaluation(actor, project.id)
        row = self._summary(project) | {"evaluated": evaluation is not None}
        if evaluation is None:
            return row
        counts = Counter(i.verdict for i in evaluation.items)
        best = next((i for i in evaluation.items if i.verdict == "valida"), None)
        row |= {"proposals_evaluated": len(evaluation.items), "verdicts": dict(counts), "best_valid": None}
        if best is not None:
            cost, currency = comparable_cost(best)
            budget = project.presupuesto_referencial
            same = cost is not None and budget is not None and currency == project.moneda.upper()
            row["best_valid"] = {
                "supplier": best.supplier,
                "filename": best.filename,
                "score": best.score,
                "cost": cost,
                "currency": currency,
                "budget_minus_cost": budget - cost if same else None,  # type: ignore[operator]
            }
        return row

    # ---------- tools ----------
    def _list_projects(self, actor: Usuario, _: NoArgs, __: TurnArtifacts) -> Any:
        projects = self._list.ejecutar(actor)
        return {
            "total": len(projects),
            "projects": [self._summary(p) for p in projects[:_MAX_PROJECTS]],
        }

    def _get_project(self, actor: Usuario, args: ProjectArgs, _: TurnArtifacts) -> Any:
        project = self._project.ejecutar(actor, args.project_id)
        result = self._summary(project) | {
            "requirement": project.requerimiento,
            "closing_reason": project.motivo_de_cierre,
            "uploaded_proposals": [
                {"proposal_id": p.id, "filename": p.archivo} for p in self._management.propuestas_de(actor, project.id)
            ],
        }
        if actor.tiene(Permiso.VER_RESULTADOS):
            result["committee_notes"] = [n.texto for n in self._management.notas_de(actor, project.id)][:20]
        return result

    def _get_evaluation(self, actor: Usuario, args: ProjectArgs, _: TurnArtifacts) -> Any:
        project, evaluation = self._entry(actor, args.project_id)
        reviews = {r.proposal_id: r for r in self._reviews.current(actor, project.id)}
        proposals = []
        for position, item in enumerate(evaluation.items, start=1):
            data = asdict(item)
            for hidden in ("evaluated_at", "criteria", "reading_warnings"):
                data.pop(hidden)
            review = reviews.get(item.proposal_id)
            data |= {
                "position": position,
                "criteria": [{"criterion": c.criterion, "score": c.score, "weight": c.weight} for c in item.criteria],
                "human_review": None if review is None else {"accepted": review.approved, "comment": review.comment},
            }
            proposals.append(data)
        return {
            "project": self._summary(project),
            "evaluated_at": evaluation.creado,
            "evaluated_count": len(evaluation.items),
            "warnings": evaluation.warnings,
            "exchange_rates": [asdict(r) for r in evaluation.exchange_rates],
            "proposals": proposals,
        }

    def _compare_proposals(self, actor: Usuario, args: CompareProposalsArgs, _: TurnArtifacts) -> Any:
        return asdict(compare(self._comparison_entries(actor, args.project_id, args.proposals)))

    def _compare_projects(self, actor: Usuario, args: CompareProjectsArgs, _: TurnArtifacts) -> Any:
        projects = [self._project.ejecutar(actor, pid) for pid in dict.fromkeys(args.project_ids)]
        if len(projects) < 2:
            raise DatoInvalido("Elija dos proyectos distintos.")
        notes = ["Cada proyecto puede tener un alcance distinto: revise los requerimientos antes de comparar costos."]
        if len({p.moneda for p in projects}) > 1:
            notes.append("Los presupuestos están en monedas distintas: no son comparables sin conversión.")
        return {"projects": [self._portfolio_row(actor, p) for p in projects], "notes": notes}

    def _recommendations(self, actor: Usuario, project_id: str) -> tuple[Proyecto, Any]:
        project = self._project.ejecutar(actor, project_id)
        evaluation = self._maybe_evaluation(actor, project_id)
        reviews = self._reviews.current(actor, project_id) if evaluation else []
        count = len(self._management.propuestas_de(actor, project_id))
        return project, recommend(project, count, evaluation, reviews)

    def _get_recommendations(self, actor: Usuario, args: ProjectArgs, _: TurnArtifacts) -> Any:
        project, found = self._recommendations(actor, args.project_id)
        return {"project": project.nombre, "recommendations": [asdict(r) for r in found]}

    def _list_suppliers(self, actor: Usuario, _: NoArgs, __: TurnArtifacts) -> Any:
        # Tax ids and contact details are not needed to analyse a budget, so they never reach the model.
        return {"suppliers": [{"name": s.nombre, "location": s.ubicacion} for s in self._management.proveedores(actor)]}

    def _private_terms(self, actor: Usuario) -> list[str]:
        terms = [self._organisation_name(actor.tenant_id), actor.display_name, actor.correo]
        terms += [s.nombre for s in self._management.proveedores(actor)]
        for project in self._list.ejecutar(actor):
            terms.append(project.nombre)
            evaluation = self._maybe_evaluation(actor, project.id)
            terms += [i.supplier for i in evaluation.items if i.supplier] if evaluation else []
        return terms

    def _search_market_price(self, actor: Usuario, args: MarketPriceArgs, artifacts: TurnArtifacts) -> Any:
        assert self._market is not None  # noqa: S101 - the tool is only registered with a lookup
        if artifacts.searches >= MAX_SEARCHES_PER_TURN:
            raise DatoInvalido(f"Máximo {MAX_SEARCHES_PER_TURN} búsquedas de precio por mensaje.")
        artifacts.searches += 1
        query = sanitise_search_query(args.product, self._private_terms(actor))
        if len(query) < 4:
            raise DatoInvalido("Describa el producto (marca, modelo o especificaciones).")
        currency = normalize_currency(args.currency) or "USD"
        reference = self._market.lookup(query, currency)
        if reference is None:
            return {"searched": query, "found": False, "note": "Sin precio de referencia con fuentes."}
        links = list(reference.links[:5])
        artifacts.links += [link for link in links if link not in artifacts.links]
        return {
            "searched": query,
            "found": True,
            "unit_price": reference.precio_unitario,
            "currency": reference.moneda,
            "distinct_sources": reference.fuentes,
            "links": links,
            "note": "Referencia automática, no es una cotización. Con una sola fuente es poco fiable.",
        }

    def _generate_report(self, actor: Usuario, args: ReportArgs, artifacts: TurnArtifacts) -> Any:
        if len(artifacts.reports) >= MAX_REPORTS_PER_TURN:
            raise DatoInvalido(f"Máximo {MAX_REPORTS_PER_TURN} reportes por mensaje.")
        if args.kind == "portfolio":
            rows = [self._portfolio_row(actor, p) for p in self._list.ejecutar(actor)]
            content = self._renderer.portfolio(rows, args.format)
            name = "presupuestos"
        else:
            if not args.project_id:
                raise DatoInvalido("Indique el proyecto del reporte.")
            if args.kind == "evaluation":
                project, evaluation = self._entry(actor, args.project_id)
                content = self._renderer.evaluation(evaluation, project.nombre, args.format)
                name = "evaluacion"
            elif args.kind == "comparison":
                comparison = compare(self._comparison_entries(actor, args.project_id, []))
                content = self._renderer.comparison(comparison, args.format)
                name = "comparativa"
            else:
                project, found = self._recommendations(actor, args.project_id)
                content = self._renderer.recommendations(project, found, args.format)
                name = "recomendaciones"
        filename = f"{name}-{len(artifacts.reports) + 1}.{args.format}"
        artifacts.reports.append(GeneratedReport(filename, args.format, content))
        return {"report_attached": filename, "note": "El archivo queda adjunto a la respuesta para descargarlo."}
