"""Raíz de composición: único lugar que conoce adaptadores concretos y los inyecta en los casos de uso."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from evaluador.adapters.outbound.almacen.cifrado import AlmacenCifrado
from evaluador.adapters.outbound.exchange_rates.bcv import BcvExchangeRateSource
from evaluador.adapters.outbound.memory.auditoria_log import AuditoriaLog
from evaluador.adapters.outbound.memory.coleccion import ColeccionEnMemoria
from evaluador.adapters.outbound.memory.repositorios import (
    SesionesEnMemoria,
    TenantsEnMemoria,
    UsuariosEnMemoria,
)
from evaluador.adapters.outbound.persistence.coleccion_postgres import ColeccionPostgres, preparar_esquema
from evaluador.adapters.outbound.persistence.exchange_rate_collection import CollectionExchangeRates, RateRecord
from evaluador.adapters.outbound.security.argon2_hasheador import Argon2Hasheador
from evaluador.adapters.outbound.security.tokens import IdsUuid, RelojSistema, TokensSeguros
from evaluador.application.ports.exchange_rates import ExchangeRateSource
from evaluador.application.use_cases.autenticacion import AutenticarToken, CerrarSesion, IniciarSesion
from evaluador.application.use_cases.evaluate_project import (
    AskProject,
    EvaluateProject,
    EvaluationServices,
    GetProjectEvaluation,
)
from evaluador.application.use_cases.exchange_rates import RegisterManualRate, ResolveRates
from evaluador.application.use_cases.gestion import Gestion
from evaluador.application.use_cases.proyectos import (
    CrearProyecto,
    ListarProyectos,
    ObtenerProyecto,
    TransicionarProyecto,
)
from evaluador.composition.ai import lazy_services
from evaluador.composition.configuracion import Configuracion
from evaluador.domain.gestion import Evento, Nota, Propuesta, Proveedor
from evaluador.domain.identidad import PoliticaDeSesion
from evaluador.domain.project_evaluation import ProjectEvaluation
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
    ask_project: AskProject
    resolve_rates: ResolveRates
    register_manual_rate: RegisterManualRate
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
        "exchange_rates": RateRecord,
    }
    if config is not None and config.persistencia == "postgres":
        url = config.base_de_datos_url.get_secret_value()
        preparar_esquema(url)
        return {nombre: ColeccionPostgres(url, nombre, clase) for nombre, clase in tipos.items()}
    return {nombre: ColeccionEnMemoria() for nombre in tipos}


def construir_contenedor(
    politica: PoliticaDeSesion | None = None,
    config: Configuracion | None = None,
    *,
    ai_services: Callable[[], EvaluationServices] | None = None,
    rate_source: ExchangeRateSource | None = None,
) -> Contenedor:
    politica = politica or PoliticaDeSesion()
    reloj, ids, tokens, hasheador = RelojSistema(), IdsUuid(), TokensSeguros(), Argon2Hasheador()
    tenants, usuarios, sesiones = TenantsEnMemoria(), UsuariosEnMemoria(), SesionesEnMemoria()
    datos = _colecciones(config)
    proyectos = datos["proyectos"]
    auditoria = AuditoriaLog(datos["eventos"], ids, reloj)
    almacen = None
    if config is not None and config.clave_cifrado and config.clave_cifrado.get_secret_value():
        almacen = AlmacenCifrado(config.directorio_documentos, config.clave_cifrado.get_secret_value())
    evaluations = datos.pop("evaluations")
    rates = CollectionExchangeRates(datos.pop("exchange_rates"), reloj)
    gestion = Gestion(**datos, usuarios=usuarios, almacen=almacen, ids=ids, reloj=reloj, auditoria=auditoria)
    ai_services = ai_services or lazy_services(config)
    resolve_rates = ResolveRates(
        rate_source or BcvExchangeRateSource(today=lambda: reloj.ahora().date()), rates, reloj
    )
    get_evaluation = GetProjectEvaluation(proyectos, evaluations)
    return Contenedor(
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
        ask_project=AskProject(get_evaluation, ai_services, auditoria),
        resolve_rates=resolve_rates,
        register_manual_rate=RegisterManualRate(rates, reloj, auditoria),
        tenants=tenants,
        usuarios=usuarios,
        hasheador=hasheador,
        ids=ids,
    )
