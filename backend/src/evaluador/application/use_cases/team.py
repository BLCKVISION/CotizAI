"""The team of an organisation: who belongs to it and what each person may do."""

from __future__ import annotations

import threading
from dataclasses import replace

from evaluador.application.ports.salida import Auditoria, GeneradorDeIds, HasheadorDeContrasenas, UsuarioRepositorio
from evaluador.domain.errores import DatoInvalido, NoEncontrado
from evaluador.domain.identidad import Permiso, Rol, Usuario
from evaluador.domain.team import MAX_MEMBERS, require_strong_password, require_valid_email

_EMAIL_TAKEN = "No se puede usar ese correo. Pruebe con otro."


class Team:
    """Changes apply on the member's next request: the user is read again every time."""

    def __init__(
        self, *, users: UsuarioRepositorio, hasher: HasheadorDeContrasenas, ids: GeneradorDeIds, audit: Auditoria
    ) -> None:
        self._users, self._hasher, self._ids, self._audit = users, hasher, ids, audit
        self._lock = threading.Lock()  # the member limit and the unique email are checked and written together

    def members(self, actor: Usuario) -> list[Usuario]:
        actor.exigir(Permiso.VER_ESTADO)
        return sorted(self._users.of_tenant(actor.tenant_id), key=lambda u: u.correo)

    def add(self, actor: Usuario, *, display_name: str, email: str, password: str, role: Rol) -> Usuario:
        actor.exigir(Permiso.MANAGE_TEAM)
        email = email.strip().lower()
        name = " ".join(display_name.split())
        if len(name) < 3:
            raise DatoInvalido("Escriba el nombre de la persona (mínimo 3 caracteres).")
        require_valid_email(email)
        require_strong_password(password, email)
        password_hash = self._hasher.hashear(password)
        with self._lock:
            if len(self._users.of_tenant(actor.tenant_id)) >= MAX_MEMBERS:
                raise DatoInvalido(f"El equipo ya tiene el máximo de {MAX_MEMBERS} personas.")
            if self._users.por_correo(email) is not None:
                raise DatoInvalido(_EMAIL_TAKEN)
            member = Usuario(
                id=self._ids.nuevo(), tenant_id=actor.tenant_id, correo=email, hash_contrasena=password_hash,
                rol=role, display_name=name,
            )  # fmt: skip
            self._users.guardar(member)
        self._record(actor, "team_member_added", f"{email}:{role.value}")
        return member

    def update(self, actor: Usuario, member_id: str, *, role: Rol | None, active: bool | None) -> Usuario:
        actor.exigir(Permiso.MANAGE_TEAM)
        if member_id == actor.id:
            # Otherwise the team could end up with nobody able to manage it.
            raise DatoInvalido("No puede cambiar su propio rol ni desactivar su propia cuenta.")
        with self._lock:
            member = self._users.por_id(actor.tenant_id, member_id)
            if member is None:
                raise NoEncontrado("Esa persona no está en su equipo.")
            changed = replace(
                member,
                rol=member.rol if role is None else role,
                activo=member.activo if active is None else active,
            )
            self._users.guardar(changed)
        if changed.rol is not member.rol:
            self._record(actor, "team_role_changed", f"{member.correo}:{member.rol.value}->{changed.rol.value}")
        if changed.activo != member.activo:
            self._record(actor, "team_member_enabled" if changed.activo else "team_member_disabled", member.correo)
        return changed

    def _record(self, actor: Usuario, action: str, detail: str) -> None:
        self._audit.registrar(tenant_id=actor.tenant_id, actor=actor.id, accion=action, detalle=detail)
