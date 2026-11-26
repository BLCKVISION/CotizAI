"""Raíz de composición: único lugar que conoce adaptadores concretos y los inyecta en los casos de uso."""

from __future__ import annotations

from dataclasses import dataclass

from evaluador.adapters.outbound.memory.auditoria_log import AuditoriaLog
from evaluador.adapters.outbound.memory.repositorios import (
    ProyectosEnMemoria,
    SesionesEnMemoria,
    TenantsEnMemoria,
    UsuariosEnMemoria,
)
from evaluador.adapters.outbound.security.argon2_hasheador import Argon2Hasheador
from evaluador.adapters.outbound.security.tokens import IdsUuid, RelojSistema, TokensSeguros
from evaluador.application.use_cases.autenticacion import AutenticarToken, CerrarSesion, IniciarSesion
from evaluador.application.use_cases.proyectos import (
    CrearProyecto,
    ListarProyectos,
    ObtenerProyecto,
    TransicionarProyecto,
)
from evaluador.domain.identidad import PoliticaDeSesion


@dataclass(frozen=True, slots=True)
class Contenedor:
    iniciar_sesion: IniciarSesion
    autenticar_token: AutenticarToken
    cerrar_sesion: CerrarSesion
    crear_proyecto: CrearProyecto
    listar_proyectos: ListarProyectos
    obtener_proyecto: ObtenerProyecto
    transicionar_proyecto: TransicionarProyecto
    # Expuestos para scripts de semillas y pruebas
    tenants: TenantsEnMemoria
    usuarios: UsuariosEnMemoria
    hasheador: Argon2Hasheador
    ids: IdsUuid


def construir_contenedor(politica: PoliticaDeSesion | None = None) -> Contenedor:
    politica = politica or PoliticaDeSesion()
    reloj, ids, tokens, hasheador, auditoria = (
        RelojSistema(),
        IdsUuid(),
        TokensSeguros(),
        Argon2Hasheador(),
        AuditoriaLog(),
    )
    tenants, usuarios, sesiones, proyectos = (
        TenantsEnMemoria(), UsuariosEnMemoria(), SesionesEnMemoria(), ProyectosEnMemoria()
    )  # fmt: skip
    return Contenedor(
        iniciar_sesion=IniciarSesion(tenants, usuarios, sesiones, hasheador, tokens, ids, reloj, auditoria, politica),
        autenticar_token=AutenticarToken(tenants, usuarios, sesiones, tokens, reloj, politica),
        cerrar_sesion=CerrarSesion(sesiones, tokens, auditoria),
        crear_proyecto=CrearProyecto(proyectos, ids, reloj, auditoria),
        listar_proyectos=ListarProyectos(proyectos),
        obtener_proyecto=ObtenerProyecto(proyectos),
        transicionar_proyecto=TransicionarProyecto(proyectos, auditoria),
        tenants=tenants,
        usuarios=usuarios,
        hasheador=hasheador,
        ids=ids,
    )
