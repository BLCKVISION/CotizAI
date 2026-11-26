"""Identidad, roles, permisos y sesiones. Sin dependencias externas."""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import datetime, timedelta
from enum import StrEnum

from .errores import SinPermiso


class Rol(StrEnum):
    CARGADOR = "cargador"
    EVALUADOR = "evaluador"
    APROBADOR = "aprobador"
    AUDITOR = "auditor"


class Permiso(StrEnum):
    CREAR_PROYECTO = "crear_proyecto"
    CARGAR_DOCUMENTOS = "cargar_documentos"
    INICIAR_EVALUACION = "iniciar_evaluacion"
    VER_ESTADO = "ver_estado"
    VER_RESULTADOS = "ver_resultados"
    ANOTAR_REVISION = "anotar_revision"
    ADJUDICAR_O_CERRAR = "adjudicar_o_cerrar"
    VER_AUDITORIA = "ver_auditoria"


# Matriz de la sección 4.1 del documento de arquitectura (mínimo privilegio).
PERMISOS_POR_ROL: dict[Rol, frozenset[Permiso]] = {
    Rol.CARGADOR: frozenset(
        {Permiso.CREAR_PROYECTO, Permiso.CARGAR_DOCUMENTOS, Permiso.INICIAR_EVALUACION, Permiso.VER_ESTADO}
    ),
    Rol.EVALUADOR: frozenset(
        {Permiso.INICIAR_EVALUACION, Permiso.VER_ESTADO, Permiso.VER_RESULTADOS, Permiso.ANOTAR_REVISION}
    ),
    Rol.APROBADOR: frozenset(
        {Permiso.VER_ESTADO, Permiso.VER_RESULTADOS, Permiso.ANOTAR_REVISION, Permiso.ADJUDICAR_O_CERRAR}
    ),
    Rol.AUDITOR: frozenset({Permiso.VER_ESTADO, Permiso.VER_RESULTADOS, Permiso.VER_AUDITORIA}),
}


@dataclass(frozen=True, slots=True)
class PoliticaDeSesion:
    max_intentos_fallidos: int = 5
    minutos_de_bloqueo: int = 15
    minutos_de_inactividad: int = 30
    horas_de_vida_maxima: int = 8


@dataclass(frozen=True, slots=True)
class Tenant:
    """Organización aislada: sus usuarios, proyectos y sesiones no se ven con las de otra."""

    id: str
    codigo: str  # identificador público y estable para el login, p. ej. "ministerio-educacion"
    nombre: str
    activo: bool = True


@dataclass(frozen=True, slots=True)
class Usuario:
    id: str
    tenant_id: str
    correo: str
    hash_contrasena: str
    rol: Rol
    activo: bool = True
    intentos_fallidos: int = 0
    bloqueado_hasta: datetime | None = None

    def esta_bloqueado(self, ahora: datetime) -> bool:
        return self.bloqueado_hasta is not None and ahora < self.bloqueado_hasta

    def con_fallo(self, ahora: datetime, politica: PoliticaDeSesion) -> Usuario:
        intentos = self.intentos_fallidos + 1
        if intentos >= politica.max_intentos_fallidos:
            return replace(
                self,
                intentos_fallidos=0,
                bloqueado_hasta=ahora + timedelta(minutes=politica.minutos_de_bloqueo),
            )
        return replace(self, intentos_fallidos=intentos)

    def con_exito(self) -> Usuario:
        return replace(self, intentos_fallidos=0, bloqueado_hasta=None)

    def con_hash(self, nuevo_hash: str) -> Usuario:
        return replace(self, hash_contrasena=nuevo_hash)

    def tiene(self, permiso: Permiso) -> bool:
        return permiso in PERMISOS_POR_ROL[self.rol]

    def exigir(self, permiso: Permiso) -> None:
        if not self.tiene(permiso):
            raise SinPermiso(f"El rol '{self.rol}' no tiene el permiso '{permiso}'.")


@dataclass(frozen=True, slots=True)
class Sesion:
    id: str
    tenant_id: str
    usuario_id: str
    token_hash: str
    creada: datetime
    expira: datetime
    ultima_actividad: datetime
    revocada: bool = False

    def es_valida(self, ahora: datetime, politica: PoliticaDeSesion) -> bool:
        if self.revocada or ahora >= self.expira:
            return False
        return ahora - self.ultima_actividad < timedelta(minutes=politica.minutos_de_inactividad)

    def con_actividad(self, ahora: datetime) -> Sesion:
        return replace(self, ultima_actividad=ahora)

    def revocar(self) -> Sesion:
        return replace(self, revocada=True)
