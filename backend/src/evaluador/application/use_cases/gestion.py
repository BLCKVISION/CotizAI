"""Casos de uso de gestión. Autorización y aislamiento por tenant se aplican aquí."""

from __future__ import annotations

import hashlib
from collections import Counter
from decimal import Decimal
from typing import Any

from evaluador.application.ports.salida import (
    Auditoria,
    Collection,
    DocumentStore,
    GeneradorDeIds,
    ProyectoRepositorio,
    Reloj,
    UsuarioRepositorio,
)
from evaluador.domain.errores import DatoInvalido, NoEncontrado, ServicioNoDisponible, TransicionInvalida
from evaluador.domain.gestion import (
    MAX_PROPUESTAS,
    Evento,
    Nota,
    Propuesta,
    Proveedor,
    sanitize_filename,
    validar_documento,
)
from evaluador.domain.identidad import Permiso, Usuario
from evaluador.domain.proyecto import EstadoProyecto, Proyecto


class Gestion:
    def __init__(
        self,
        *,
        proyectos: ProyectoRepositorio,
        propuestas: Collection[Propuesta],
        proveedores: Collection[Proveedor],
        notas: Collection[Nota],
        eventos: Collection[Evento],
        usuarios: UsuarioRepositorio,
        almacen: DocumentStore | None,
        ids: GeneradorDeIds,
        reloj: Reloj,
        auditoria: Auditoria,
    ) -> None:
        self._proyectos, self._propuestas, self._proveedores = proyectos, propuestas, proveedores
        self._notas, self._eventos, self._usuarios, self._almacen = notas, eventos, usuarios, almacen
        self._ids, self._reloj, self._auditoria = ids, reloj, auditoria

    def _proyecto(self, actor: Usuario, proyecto_id: str) -> Proyecto:
        p = self._proyectos.por_id(actor.tenant_id, proyecto_id)
        if p is None:
            raise NoEncontrado("Proyecto no encontrado.")
        return p

    def _auditar(self, actor: Usuario, accion: str, detalle: str) -> None:
        self._auditoria.registrar(tenant_id=actor.tenant_id, actor=actor.id, accion=accion, detalle=detalle)

    def correo_de(self, tenant_id: str, usuario_id: str | None) -> str:
        u = self._usuarios.por_id(tenant_id, usuario_id) if usuario_id else None
        return u.correo if u else "—"

    # ---------- Propuestas ----------
    def propuestas_de(self, actor: Usuario, proyecto_id: str) -> list[Propuesta]:
        actor.exigir(Permiso.VER_ESTADO)
        self._proyecto(actor, proyecto_id)
        return sorted(
            (p for p in self._propuestas.listar(actor.tenant_id) if p.proyecto_id == proyecto_id),
            key=lambda p: p.archivo.lower(),
        )

    def _require_open_for_uploads(self, proyecto: Proyecto) -> None:
        """New offers may arrive after an evaluation; removing evaluated evidence is still not allowed."""
        if proyecto.estado not in (EstadoProyecto.EN_RECEPCION, EstadoProyecto.EN_REVISION_DEL_COMITE):
            raise TransicionInvalida("El proyecto ya no admite propuestas nuevas.")

    def cargar(self, actor: Usuario, proyecto_id: str, archivo: str, contenido: bytes) -> Propuesta:
        actor.exigir(Permiso.CARGAR_DOCUMENTOS)
        self._require_open_for_uploads(self._proyecto(actor, proyecto_id))
        if self._almacen is None:
            raise ServicioNoDisponible("El almacén cifrado no está configurado.")
        archivo = sanitize_filename(archivo)
        formato = validar_documento(archivo, contenido)
        existentes = self.propuestas_de(actor, proyecto_id)
        if len(existentes) >= MAX_PROPUESTAS:
            raise DatoInvalido(f"El proyecto ya tiene el máximo de {MAX_PROPUESTAS} propuestas.")
        huella = hashlib.sha256(contenido).hexdigest()
        identificador = archivo.rsplit(".", 1)[0].lower()
        if any(p.archivo.rsplit(".", 1)[0].lower() == identificador for p in existentes):
            raise DatoInvalido("Ya existe una propuesta con ese nombre.")
        if any(p.sha256 == huella for p in existentes):
            raise DatoInvalido("Ese mismo archivo ya fue cargado con otro nombre.")
        propuesta = Propuesta(
            self._ids.nuevo(), actor.tenant_id, proyecto_id, archivo, formato, len(contenido), huella,
            actor.id, self._reloj.ahora(),
        )  # fmt: skip
        self._almacen.guardar(actor.tenant_id, propuesta.id, contenido)
        self._propuestas.guardar(propuesta)
        self._auditar(actor, "propuesta_cargada", f"{proyecto_id}:{archivo}")
        return propuesta

    def _propuesta(self, actor: Usuario, proyecto_id: str, propuesta_id: str) -> Propuesta:
        p = self._propuestas.por_id(actor.tenant_id, propuesta_id)
        if p is None or p.proyecto_id != proyecto_id:
            raise NoEncontrado("Propuesta no encontrada.")
        return p

    def descargar(self, actor: Usuario, proyecto_id: str, propuesta_id: str) -> tuple[Propuesta, bytes]:
        if not actor.tiene(Permiso.CARGAR_DOCUMENTOS):
            actor.exigir(Permiso.VER_RESULTADOS)
        p = self._propuesta(actor, proyecto_id, propuesta_id)
        if self._almacen is None:
            raise ServicioNoDisponible("El almacén cifrado no está configurado.")
        contenido = self._almacen.leer(actor.tenant_id, p.id)
        self._auditar(actor, "propuesta_descargada", f"{proyecto_id}:{p.archivo}")
        return p, contenido

    def read_for_evaluation(self, actor: Usuario, project_id: str, proposal_id: str) -> bytes:
        """Content for the engine. Needs permission to evaluate, not to download, and verifies integrity."""
        actor.exigir(Permiso.INICIAR_EVALUACION)
        proposal = self._propuesta(actor, project_id, proposal_id)
        if self._almacen is None:
            raise ServicioNoDisponible("El almacén cifrado no está configurado.")
        content = self._almacen.leer(actor.tenant_id, proposal.id)
        if hashlib.sha256(content).hexdigest() != proposal.sha256:
            raise ServicioNoDisponible(f"El archivo {proposal.archivo} no coincide con su huella registrada.")
        return content

    def erase_file(self, tenant_id: str, proposal_id: str) -> None:
        if self._almacen is not None:
            self._almacen.eliminar(tenant_id, proposal_id)

    def eliminar_propuesta(self, actor: Usuario, proyecto_id: str, propuesta_id: str) -> Propuesta:
        """Removes the file and its record. Use `DeleteProposal`, which also drops the results."""
        actor.exigir(Permiso.CARGAR_DOCUMENTOS)
        self._require_open_for_uploads(self._proyecto(actor, proyecto_id))
        p = self._propuesta(actor, proyecto_id, propuesta_id)
        self._propuestas.eliminar(actor.tenant_id, p.id)
        if self._almacen is not None:
            self._almacen.eliminar(actor.tenant_id, p.id)
        self._auditar(actor, "propuesta_eliminada", f"{proyecto_id}:{p.archivo}:{p.sha256}")
        return p

    # ---------- Notas e historial ----------
    def notas_de(self, actor: Usuario, proyecto_id: str) -> list[Nota]:
        actor.exigir(Permiso.VER_RESULTADOS)
        self._proyecto(actor, proyecto_id)
        return [n for n in self._notas.listar(actor.tenant_id) if n.proyecto_id == proyecto_id]

    def anotar(self, actor: Usuario, proyecto_id: str, texto: str) -> Nota:
        actor.exigir(Permiso.ANOTAR_REVISION)
        self._proyecto(actor, proyecto_id)
        if not texto.strip():
            raise DatoInvalido("La nota está vacía.")
        nota = Nota(self._ids.nuevo(), actor.tenant_id, proyecto_id, actor.id, texto.strip(), self._reloj.ahora())
        self._notas.guardar(nota)
        self._auditar(actor, "nota_agregada", proyecto_id)
        return nota

    def historial(self, actor: Usuario, proyecto_id: str) -> list[Evento]:
        actor.exigir(Permiso.VER_RESULTADOS)
        self._proyecto(actor, proyecto_id)
        propios = [e for e in self._eventos.listar(actor.tenant_id) if e.detalle.split(":")[0] == proyecto_id]
        return sorted(propios, key=lambda e: e.secuencia, reverse=True)

    def auditoria(self, actor: Usuario) -> list[Evento]:
        actor.exigir(Permiso.VER_AUDITORIA)
        return sorted(self._eventos.listar(actor.tenant_id), key=lambda e: e.secuencia, reverse=True)

    # ---------- Proveedores ----------
    def proveedores(self, actor: Usuario) -> list[Proveedor]:
        actor.exigir(Permiso.VER_ESTADO)
        return sorted(self._proveedores.listar(actor.tenant_id), key=lambda p: p.nombre.lower())

    def registrar_proveedor(self, actor: Usuario, *, nombre: str, rif: str, ubicacion: str, contacto: str) -> Proveedor:
        actor.exigir(Permiso.CARGAR_DOCUMENTOS)
        rif = rif.strip().upper()
        if any(p.rif == rif for p in self._proveedores.listar(actor.tenant_id)):
            raise DatoInvalido("Ya existe un proveedor con ese RIF.")
        p = Proveedor(
            self._ids.nuevo(), actor.tenant_id, nombre.strip(), rif, ubicacion.strip(), contacto.strip(),
            self._reloj.ahora(),
        )  # fmt: skip
        self._proveedores.guardar(p)
        self._auditar(actor, "proveedor_registrado", p.id)
        return p

    # ---------- Estadísticas (solo datos reales) ----------
    def estadisticas(self, actor: Usuario) -> dict[str, Any]:
        actor.exigir(Permiso.VER_ESTADO)
        proyectos = self._proyectos.listar(actor.tenant_id)
        vigentes = {p.id for p in proyectos}
        propuestas = [p for p in self._propuestas.listar(actor.tenant_id) if p.proyecto_id in vigentes]
        presupuestos: dict[str, Decimal] = {}
        for p in proyectos:
            if p.presupuesto_referencial is not None:
                presupuestos[p.moneda] = presupuestos.get(p.moneda, Decimal(0)) + p.presupuesto_referencial
        por_estado = Counter(p.estado.value for p in proyectos)
        por_proyecto = Counter(p.proyecto_id for p in propuestas)
        return {
            "total_proyectos": len(proyectos),
            "total_propuestas": len(propuestas),
            "total_proveedores": len(self._proveedores.listar(actor.tenant_id)),
            "por_estado": {e.value: por_estado.get(e.value, 0) for e in EstadoProyecto},
            "por_formato": {f: sum(p.formato == f for p in propuestas) for f in ("pdf", "jpg", "png", "xlsx")},
            "por_ubicacion": dict(Counter(p.ubicacion for p in proyectos).most_common(6)),
            "por_mes": dict(sorted(Counter(p.creado.strftime("%Y-%m") for p in proyectos).items())[-6:]),
            "presupuestos": {m: str(v) for m, v in sorted(presupuestos.items())},
            "propuestas_por_proyecto": {p.id: por_proyecto.get(p.id, 0) for p in proyectos},
        }
