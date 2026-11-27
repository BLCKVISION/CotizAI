"""Raíz de composición: único lugar que conoce adaptadores concretos y los inyecta en los casos de uso."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from evaluador.adapters.outbound.almacen.cifrado import AlmacenCifrado
from evaluador.adapters.outbound.exchange_rates.bcv import BcvExchangeRateSource
from evaluador.adapters.outbound.extraccion.ocr_tesseract import TesseractOcr
from evaluador.adapters.outbound.extraccion.to_markdown import DocumentToMarkdown
from evaluador.adapters.outbound.memory.auditoria_log import AuditoriaLog
from evaluador.adapters.outbound.memory.coleccion import ColeccionEnMemoria
from evaluador.adapters.outbound.memory.repositorios import (
    SesionesEnMemoria,
    TenantsEnMemoria,
    UsuariosEnMemoria,
)
from evaluador.adapters.outbound.persistence.coleccion_postgres import ColeccionPostgres, preparar_esquema
from evaluador.adapters.outbound.persistence.exchange_rate_collection import CollectionExchangeRates, RateRecord
from evaluador.adapters.outbound.persistence.identity import (
    PersistentTenants,
    PersistentUsers,
    TenantRecord,
    UserRecord,
)
from evaluador.adapters.outbound.reportes.assistant_report import ReportFileRenderer
from evaluador.adapters.outbound.security.argon2_hasheador import Argon2Hasheador
from evaluador.adapters.outbound.security.tokens import IdsUuid, JwtTokens, RelojSistema
from evaluador.application.ports.agente import ModeloConVision
from evaluador.application.ports.assistant import MarketPriceLookup
from evaluador.application.ports.exchange_rates import ExchangeRateSource
from evaluador.application.use_cases.ask_portfolio import AskPortfolio
from evaluador.application.use_cases.assistant.chat import AskAssistant, AssistantServices
from evaluador.application.use_cases.assistant.tools import AssistantTools
from evaluador.application.use_cases.autenticacion import AutenticarToken, CerrarSesion, IniciarSesion
from evaluador.application.use_cases.deletion import DeleteProject, DeleteProposal
from evaluador.application.use_cases.evaluate_project import (
    AskProject,
    EvaluateProject,
    EvaluationServices,
    GetProjectEvaluation,
)
from evaluador.application.use_cases.exchange_rates import RegisterManualRate, ResolveRates
from evaluador.application.use_cases.gestion import Gestion
from evaluador.application.use_cases.history import ArchivingEvaluations, EvaluationHistory, GetSupplierDirectory
from evaluador.application.use_cases.proposal_markdown import GetProposalMarkdown
from evaluador.application.use_cases.proyectos import (
    CrearProyecto,
    ListarProyectos,
    ObtenerProyecto,
    TransicionarProyecto,
)
from evaluador.application.use_cases.registration import SELF_SERVICE_PREFIX, RegisterAccount
from evaluador.application.use_cases.review_proposals import ReviewProposals
from evaluador.application.use_cases.team import Team
from evaluador.application.use_cases.transcription import TranscribeImage
from evaluador.composition.ai import lazy_services
from evaluador.composition.assistant import (
    LangGraphAssistantEngine,
    assistant_market_for,
    lazy_assistant_services,
)
from evaluador.composition.configuracion import Configuracion
from evaluador.composition.transcription import lazy_transcriber
from evaluador.domain.gestion import Evento, Nota, Propuesta, Proveedor
from evaluador.domain.identidad import PoliticaDeSesion
from evaluador.domain.project_evaluation import ProjectEvaluation, ReviewDecision
from evaluador.domain.proyecto import Proyecto


@dataclass(frozen=True, slots=True)
class Contenedor:
    iniciar_sesion: IniciarSesion
    autenticar_token: AutenticarToken
    cerrar_sesion: CerrarSesion
    crear_proyecto: CrearProyecto
    listar_proyectos: ListarProyectos
    obtener_proyecto: ObtenerProyecto
    transicionar_proyecto: TransicionarProyecto
    gestion: Gestion
    evaluate_project: EvaluateProject
    get_project_evaluation: GetProjectEvaluation
    review_proposals: ReviewProposals
    ask_project: AskProject
    ask_portfolio: AskPortfolio
    resolve_rates: ResolveRates
    register_manual_rate: RegisterManualRate
    transcribe_image: TranscribeImage
    proposal_markdown: GetProposalMarkdown
    delete_proposal: DeleteProposal
    delete_project: DeleteProject
    ask_assistant: AskAssistant
    register_account: RegisterAccount
    evaluation_history: EvaluationHistory
    supplier_directory: GetSupplierDirectory
    team: Team
    # Expuestos para scripts de semillas y pruebas
    tenants: TenantsEnMemoria
    usuarios: UsuariosEnMemoria
    hasheador: Argon2Hasheador
    ids: IdsUuid


def _colecciones(config: Configuracion | None) -> dict:
    tipos = {
        "proyectos": Proyecto,
        "propuestas": Propuesta,
        "proveedores": Proveedor,
        "notas": Nota,
        "eventos": Evento,
        "evaluations": ProjectEvaluation,
        "evaluation_runs": ProjectEvaluation,
        "reviews": ReviewDecision,
        "exchange_rates": RateRecord,
    }
    if config is not None and config.persistencia == "postgres":
        url = config.base_de_datos_url.get_secret_value()
        preparar_esquema(url)
        return {nombre: ColeccionPostgres(url, nombre, clase) for nombre, clase in tipos.items()}
    return {nombre: ColeccionEnMemoria() for nombre in tipos}


def _identity(config: Configuracion | None) -> tuple[TenantsEnMemoria, UsuariosEnMemoria]:
    if config is None or config.persistencia != "postgres":
        return TenantsEnMemoria(), UsuariosEnMemoria()
    url = config.base_de_datos_url.get_secret_value()  # the schema was prepared with the other collections
    return (
        PersistentTenants(ColeccionPostgres(url, "tenant_accounts", TenantRecord)),
        PersistentUsers(ColeccionPostgres(url, "user_accounts", UserRecord)),
    )


def _session_tokens(config: Configuracion | None) -> JwtTokens:
    secret = config.jwt_secret.get_secret_value() if config is not None and config.jwt_secret else ""
    if not secret and config is not None and config.es_produccion:
        raise ValueError("EVALUADOR_JWT_SECRET es obligatorio en producción.")
    return JwtTokens(secret or None)


def construir_contenedor(
    politica: PoliticaDeSesion | None = None,
    config: Configuracion | None = None,
    *,
    ai_services: Callable[[], EvaluationServices] | None = None,
    rate_source: ExchangeRateSource | None = None,
    vision_model: ModeloConVision | None = None,
    assistant_services: Callable[[], AssistantServices] | None = None,
    market_lookup: MarketPriceLookup | None = None,
) -> Contenedor:
    politica = politica or PoliticaDeSesion()
    reloj, ids, tokens, hasheador = RelojSistema(), IdsUuid(), _session_tokens(config), Argon2Hasheador()
    datos = _colecciones(config)
    tenants, usuarios = _identity(config)
    sesiones = SesionesEnMemoria()
    proyectos = datos["proyectos"]
    auditoria = AuditoriaLog(datos["eventos"], ids, reloj)
    almacen = None
    if config is not None and config.clave_cifrado and config.clave_cifrado.get_secret_value():
        almacen = AlmacenCifrado(config.directorio_documentos, config.clave_cifrado.get_secret_value())
    evaluations = ArchivingEvaluations(datos.pop("evaluations"), datos.pop("evaluation_runs"), ids.nuevo)
    reviews = datos.pop("reviews")
    rates = CollectionExchangeRates(datos.pop("exchange_rates"), reloj)
    gestion = Gestion(**datos, usuarios=usuarios, almacen=almacen, ids=ids, reloj=reloj, auditoria=auditoria)
    ai_services = ai_services or lazy_services(config)
    resolve_rates = ResolveRates(
        rate_source or BcvExchangeRateSource(today=lambda: reloj.ahora().date()), rates, reloj
    )
    get_evaluation = GetProjectEvaluation(proyectos, evaluations)
    ocr = TesseractOcr.if_available()
    transcriber = lazy_transcriber(config, vision_model, ocr)
    proposal_markdown = GetProposalMarkdown(gestion, DocumentToMarkdown(transcriber, lambda: ocr))
    review_proposals = ReviewProposals(
        projects=proyectos, evaluations=evaluations, decisions=reviews, clock=reloj, audit=auditoria
    )

    def organisation_name(tenant_id: str) -> str:
        tenant = tenants.por_id(tenant_id)
        return tenant.nombre if tenant else ""

    ask_assistant = AskAssistant(
        tools=AssistantTools(
            list_projects=ListarProyectos(proyectos),
            get_project=ObtenerProyecto(proyectos),
            get_evaluation=get_evaluation,
            management=gestion,
            reviews=review_proposals,
            renderer=ReportFileRenderer(),
            market=market_lookup or assistant_market_for(config),
            organisation_name=organisation_name,
        ),
        engine=LangGraphAssistantEngine(),
        services=assistant_services or lazy_assistant_services(config),
        tenants=tenants,
        clock=reloj,
        ids=ids,
        audit=auditoria,
    )
    def count_self_service_accounts() -> int:
        found = (tenants.por_id(u.tenant_id) for u in usuarios.all())
        return sum(1 for t in found if t is not None and t.codigo.startswith(SELF_SERVICE_PREFIX))

    register_account = RegisterAccount(
        tenants=tenants,
        users=usuarios,
        hasher=hasheador,
        ids=ids,
        audit=auditoria,
        count_accounts=count_self_service_accounts,
        enabled=config.registration_enabled if config else True,
        max_accounts=config.registration_max_accounts if config else 25,
    )
    return Contenedor(
        ask_assistant=ask_assistant,
        register_account=register_account,
        iniciar_sesion=IniciarSesion(tenants, usuarios, sesiones, hasheador, tokens, ids, reloj, auditoria, politica),
        autenticar_token=AutenticarToken(tenants, usuarios, sesiones, tokens, reloj, politica),
        cerrar_sesion=CerrarSesion(sesiones, tokens, auditoria),
        crear_proyecto=CrearProyecto(proyectos, ids, reloj, auditoria),
        listar_proyectos=ListarProyectos(proyectos),
        obtener_proyecto=ObtenerProyecto(proyectos),
        transicionar_proyecto=TransicionarProyecto(proyectos, auditoria),
        gestion=gestion,
        evaluate_project=EvaluateProject(
            projects=proyectos,
            gestion=gestion,
            evaluations=evaluations,
            services=ai_services,
            resolve_rates=resolve_rates,
            clock=reloj,
            audit=auditoria,
            parallelism=config.evaluation_parallelism if config else 3,
        ),
        get_project_evaluation=get_evaluation,
        review_proposals=review_proposals,
        ask_portfolio=AskPortfolio(
            projects=ListarProyectos(proyectos),
            management=gestion,
            evaluations=get_evaluation,
            services=ai_services,
            audit=auditoria,
        ),
        ask_project=AskProject(get_evaluation, ai_services, auditoria),
        resolve_rates=resolve_rates,
        register_manual_rate=RegisterManualRate(rates, reloj, auditoria),
        transcribe_image=TranscribeImage(transcriber),
        proposal_markdown=proposal_markdown,
        delete_proposal=DeleteProposal(
            projects=proyectos, management=gestion, evaluations=evaluations, decisions=reviews, audit=auditoria,
            forget_text=proposal_markdown.forget,
        ),
        delete_project=DeleteProject(
            projects=proyectos, proposals=datos["propuestas"], notes=datos["notas"], evaluations=evaluations,
            decisions=reviews, store=gestion, audit=auditoria, forget_text=proposal_markdown.forget,
            forget_runs=evaluations.forget_runs,
        ),
        evaluation_history=EvaluationHistory(proyectos, evaluations, gestion),
        supplier_directory=GetSupplierDirectory(proyectos, evaluations, datos["proveedores"]),
        team=Team(users=usuarios, hasher=hasheador, ids=ids, audit=auditoria),
        tenants=tenants,
        usuarios=usuarios,
        hasheador=hasheador,
        ids=ids,
    )
