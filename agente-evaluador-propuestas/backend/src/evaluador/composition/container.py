"""Raíz de composición: único lugar que conoce adaptadores concretos y los inyecta en los casos de uso."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from evaluador.adapters.outbound.extraction.reader import read_document
from evaluador.adapters.outbound.memory.audit_trail import ChainedAudit
from evaluador.adapters.outbound.reports import RENDERERS
from evaluador.adapters.outbound.security.argon2_hasher import Argon2Hasher
from evaluador.adapters.outbound.security.tokens import IdsUuid, SecureTokens, SystemClock
from evaluador.application.ports.agent import LanguageModel, VisionModel
from evaluador.application.use_cases.audit import ListAudit, VerifyAudit
from evaluador.application.use_cases.authentication import AuthenticateToken, CloseSession, StartSession
from evaluador.application.use_cases.chat import AskEvaluationChat
from evaluador.application.use_cases.evaluation_flow import GetEvaluationResult, ListJobEvents, StartEvaluation
from evaluador.application.use_cases.evaluation_lookup import RepositoryEvaluationLookup
from evaluador.application.use_cases.export_report import ExportReport
from evaluador.application.use_cases.ingestion import DeleteProposal, ListProposals, UploadProposal
from evaluador.application.use_cases.projects import (
    CreateProject,
    GetProject,
    ListProjects,
    TransitionProject,
)
from evaluador.application.use_cases.reviews import AddReview, ListReviews
from evaluador.application.use_cases.suppliers import CheckSupplierHistory, ListSuppliers, SupplierRecords
from evaluador.application.use_cases.transcription import TranscribeImage
from evaluador.composition.settings import Settings
from evaluador.composition.wiring import (
    ChatUnavailable,
    EvaluationSources,
    LazyEmbedder,
    ProjectNames,
    ResultSource,
    build_repositories,
)
from evaluador.domain.identity import SessionPolicy

_DEFAULT_EMBEDDINGS = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"


@dataclass(frozen=True, slots=True)
class Container:
    start_session: StartSession
    authenticate_token: AuthenticateToken
    close_session: CloseSession
    create_project: CreateProject
    list_projects: ListProjects
    get_project: GetProject
    transition_project: TransitionProject
    transcribe: TranscribeImage
    upload_proposal: UploadProposal
    list_proposals: ListProposals
    delete_proposal: DeleteProposal
    start_evaluation: StartEvaluation
    get_evaluation_result: GetEvaluationResult
    list_job_events: ListJobEvents
    add_review: AddReview
    list_reviews: ListReviews
    list_suppliers: ListSuppliers
    supplier_records: SupplierRecords
    check_supplier_history: CheckSupplierHistory
    list_audit: ListAudit
    verify_audit: VerifyAudit
    export_report: ExportReport
    ask_chat: AskEvaluationChat | ChatUnavailable
    # Expuestos para scripts de semillas y pruebas
    tenants: Any
    users: Any
    hasher: Argon2Hasher
    ids: IdsUuid


def build_container(
    policy: SessionPolicy | None = None,
    vision: VisionModel | None = None,
    config: Settings | None = None,
    model: LanguageModel | None = None,
) -> Container:
    """`vision` lee imágenes y `model` responde el chat; sin ellos, esas funciones responden 503 en vez de fallar.

    Con `config.persistence == "sql"` los datos viven en la base de datos; si no, en memoria."""
    policy = policy or SessionPolicy()
    repos = build_repositories(config)
    clock, ids, tokens, hasher = SystemClock(), IdsUuid(), SecureTokens(), Argon2Hasher()
    audit = ChainedAudit(repos.audit_trail, clock)  # cadena por organización + el log estructurado de siempre
    lookup = RepositoryEvaluationLookup(repos.jobs, repos.results)
    sources = EvaluationSources(
        repos.jobs, lookup, repos.proposals, repos.files, lambda name, data: read_document(name, data, vision)
    )
    if model is not None:
        embedder = LazyEmbedder(
            config.embeddings_model if config else _DEFAULT_EMBEDDINGS, config.embeddings_cache if config else None
        )
        ask_chat: AskEvaluationChat | ChatUnavailable = AskEvaluationChat(sources, sources, model, embedder, audit)
    else:
        ask_chat = ChatUnavailable()
    return Container(
        start_session=StartSession(
            repos.tenants, repos.users, repos.sessions, hasher, tokens, ids, clock, audit, policy
        ),
        authenticate_token=AuthenticateToken(repos.tenants, repos.users, repos.sessions, tokens, clock, policy),
        close_session=CloseSession(repos.sessions, tokens, audit),
        create_project=CreateProject(repos.projects, ids, clock, audit),
        list_projects=ListProjects(repos.projects),
        get_project=GetProject(repos.projects),
        transition_project=TransitionProject(repos.projects, audit),
        transcribe=TranscribeImage(vision),
        upload_proposal=UploadProposal(repos.projects, repos.proposals, repos.files, ids, clock, audit),
        list_proposals=ListProposals(repos.projects, repos.proposals),
        delete_proposal=DeleteProposal(repos.projects, repos.proposals, repos.files, audit),
        start_evaluation=StartEvaluation(repos.projects, repos.proposals, repos.jobs, ids, clock, audit),
        get_evaluation_result=GetEvaluationResult(repos.jobs, repos.results),
        list_job_events=ListJobEvents(repos.jobs, repos.job_events),
        add_review=AddReview(repos.reviews, lookup, ids, clock, audit),
        list_reviews=ListReviews(repos.reviews, lookup),
        list_suppliers=ListSuppliers(repos.suppliers),
        supplier_records=SupplierRecords(repos.suppliers),
        check_supplier_history=CheckSupplierHistory(repos.suppliers, lookup),
        list_audit=ListAudit(repos.audit_trail),
        verify_audit=VerifyAudit(repos.audit_trail),
        export_report=ExportReport(ResultSource(repos.results), ProjectNames(repos.projects), RENDERERS, audit),
        ask_chat=ask_chat,
        tenants=repos.tenants,
        users=repos.users,
        hasher=hasher,
        ids=ids,
    )
