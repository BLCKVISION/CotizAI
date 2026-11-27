"""Casos de uso de autenticación multi-tenant: iniciar sesión, validar token y cerrar sesión."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import NoReturn

from evaluador.application.ports.salida import (
    Auditoria,
    GeneradorDeIds,
    GeneradorDeTokens,
    HasheadorDeContrasenas,
    Reloj,
    SesionRepositorio,
    TenantRepositorio,
    TokenClaims,
    UsuarioRepositorio,
)
from evaluador.domain.errores import CredencialesInvalidas, SesionInvalida
from evaluador.domain.identidad import PoliticaDeSesion, Sesion, Usuario


@dataclass(frozen=True, slots=True)
class SesionIniciada:
    token: str
    sesion_id: str
    expira: datetime
    usuario: Usuario


@dataclass(frozen=True, slots=True)
class SesionAutenticada:
    sesion_id: str
    usuario: Usuario

    @property
    def tenant_id(self) -> str:
        return self.usuario.tenant_id


class IniciarSesion:
    def __init__(
        self,
        tenants: TenantRepositorio,
        usuarios: UsuarioRepositorio,
        sesiones: SesionRepositorio,
        hasheador: HasheadorDeContrasenas,
        tokens: GeneradorDeTokens,
        ids: GeneradorDeIds,
        reloj: Reloj,
        auditoria: Auditoria,
        politica: PoliticaDeSesion,
    ) -> None:
        self._tenants = tenants
        self._usuarios = usuarios
        self._sesiones = sesiones
        self._hasheador = hasheador
        self._tokens = tokens
        self._ids = ids
        self._reloj = reloj
        self._auditoria = auditoria
        self._politica = politica

    def ejecutar(self, correo: str, contrasena: str) -> SesionIniciada:
        ahora = self._reloj.ahora()
        usuario = self._usuarios.por_correo(correo.strip().lower())
        if usuario is None:
            self._rechazar(contrasena, tenant_id=None, actor=None, motivo="usuario_desconocido")

        tenant = self._tenants.por_id(usuario.tenant_id)  # el tenant sale del usuario, nunca del cliente
        if tenant is None or not tenant.activo:
            self._rechazar(contrasena, tenant_id=usuario.tenant_id, actor=usuario.id, motivo="organizacion_inactiva")

        if not usuario.activo or usuario.esta_bloqueado(ahora):
            self._rechazar(contrasena, tenant_id=tenant.id, actor=usuario.id, motivo="inactivo_o_bloqueado")

        if not self._hasheador.verificar(usuario.hash_contrasena, contrasena):
            self._usuarios.guardar(usuario.con_fallo(ahora, self._politica))
            self._auditoria.registrar(
                tenant_id=tenant.id, actor=usuario.id, accion="login_fallido", detalle="contrasena_erronea"
            )
            raise CredencialesInvalidas("Credenciales inválidas.")

        usuario = usuario.con_exito()
        if self._hasheador.requiere_rehash(usuario.hash_contrasena):
            usuario = usuario.con_hash(self._hasheador.hashear(contrasena))
        self._usuarios.guardar(usuario)

        session_id = self._ids.nuevo()
        expires_at = ahora + timedelta(hours=self._politica.horas_de_vida_maxima)
        token = self._tokens.issue(
            TokenClaims(
                user_id=usuario.id,
                tenant_id=tenant.id,
                session_id=session_id,
                role=usuario.rol.value,
                issued_at=ahora,
                expires_at=expires_at,
            )
        )
        sesion = Sesion(
            id=session_id,
            tenant_id=tenant.id,
            usuario_id=usuario.id,
            token_hash=self._tokens.huella(token),
            creada=ahora,
            expira=expires_at,
            ultima_actividad=ahora,
        )
        self._sesiones.guardar(sesion)
        self._auditoria.registrar(tenant_id=tenant.id, actor=usuario.id, accion="login_exitoso", detalle=sesion.id)
        return SesionIniciada(token=token, sesion_id=sesion.id, expira=sesion.expira, usuario=usuario)

    def _rechazar(self, contrasena: str, *, tenant_id: str | None, actor: str | None, motivo: str) -> NoReturn:
        """Mismo mensaje y mismo coste de tiempo en todos los rechazos (sin enumeración)."""
        self._hasheador.verificar_ficticio(contrasena)
        self._auditoria.registrar(tenant_id=tenant_id, actor=actor, accion="login_rechazado", detalle=motivo)
        raise CredencialesInvalidas("Credenciales inválidas.")


class AutenticarToken:
    """Resuelve el token a usuario, sesión y tenant; renueva la actividad (expiración deslizante)."""

    def __init__(
        self,
        tenants: TenantRepositorio,
        usuarios: UsuarioRepositorio,
        sesiones: SesionRepositorio,
        tokens: GeneradorDeTokens,
        reloj: Reloj,
        politica: PoliticaDeSesion,
    ) -> None:
        self._tenants = tenants
        self._usuarios = usuarios
        self._sesiones = sesiones
        self._tokens = tokens
        self._reloj = reloj
        self._politica = politica

    def ejecutar(self, token: str) -> SesionAutenticada:
        ahora = self._reloj.ahora()
        claims = self._tokens.verify(token, ahora)  # forged or expired tokens never reach the store
        sesion = self._sesiones.por_token_hash(self._tokens.huella(token))
        if sesion is None or not sesion.es_valida(ahora, self._politica):
            raise SesionInvalida("Sesión inválida o expirada.")
        if (claims.session_id, claims.user_id, claims.tenant_id) != (sesion.id, sesion.usuario_id, sesion.tenant_id):
            raise SesionInvalida("Sesión inválida o expirada.")
        tenant = self._tenants.por_id(sesion.tenant_id)
        usuario = self._usuarios.por_id(sesion.tenant_id, sesion.usuario_id)
        if tenant is None or not tenant.activo or usuario is None or not usuario.activo:
            raise SesionInvalida("Sesión inválida o expirada.")
        self._sesiones.guardar(sesion.con_actividad(ahora))
        return SesionAutenticada(sesion_id=sesion.id, usuario=usuario)


class CerrarSesion:
    def __init__(self, sesiones: SesionRepositorio, tokens: GeneradorDeTokens, auditoria: Auditoria) -> None:
        self._sesiones = sesiones
        self._tokens = tokens
        self._auditoria = auditoria

    def ejecutar(self, token: str) -> None:
        sesion = self._sesiones.por_token_hash(self._tokens.huella(token))
        if sesion is not None:
            self._sesiones.guardar(sesion.revocar())
            self._auditoria.registrar(
                tenant_id=sesion.tenant_id, actor=sesion.usuario_id, accion="logout", detalle=sesion.id
            )
