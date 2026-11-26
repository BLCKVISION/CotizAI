"""DTOs de entrada y salida. Validación estricta en el borde: campos extra prohibidos, longitudes acotadas."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, SecretStr

from evaluador.domain.identidad import Rol, Usuario
from evaluador.domain.proyecto import EstadoProyecto, Proyecto

ID_PATRON = r"^[0-9a-fA-F-]{36}$"


class DtoEntrada(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, frozen=True)


class DtoSalida(BaseModel):
    model_config = ConfigDict(frozen=True)


# ---------- Sesiones ----------
class IniciarSesionDto(DtoEntrada):
    correo: Annotated[str, Field(min_length=3, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")]
    contrasena: Annotated[SecretStr, Field(min_length=1, max_length=128)]


class UsuarioRespuesta(DtoSalida):
    id: str
    correo: str
    rol: Rol
    organizacion_id: str

    @classmethod
    def desde_dominio(cls, u: Usuario) -> UsuarioRespuesta:
        return cls(id=u.id, correo=u.correo, rol=u.rol, organizacion_id=u.tenant_id)


class SesionRespuesta(DtoSalida):
    token_acceso: str
    tipo_token: str = "Bearer"  # noqa: S105 - nombre del esquema HTTP, no un secreto
    expira: datetime
    usuario: UsuarioRespuesta


# ---------- Proyectos ----------
class CrearProyectoDto(DtoEntrada):
    nombre: Annotated[str, Field(min_length=3, max_length=120)]
    requerimiento: Annotated[str, Field(min_length=1, max_length=5000)]
    ubicacion: Annotated[str, Field(min_length=1, max_length=200)]
    presupuesto_referencial: Annotated[Decimal | None, Field(default=None, gt=0, max_digits=14, decimal_places=2)]
    moneda: Literal["USD", "VES"] = "USD"


class TransicionDto(DtoEntrada):
    destino: EstadoProyecto
    motivo: Annotated[str | None, Field(default=None, max_length=500)]


class ProyectoRespuesta(DtoSalida):
    id: str
    nombre: str
    requerimiento: str
    ubicacion: str
    presupuesto_referencial: Decimal | None
    estado: EstadoProyecto
    creado: datetime
    motivo_de_cierre: str | None
    moneda: str

    @classmethod
    def desde_dominio(cls, p: Proyecto) -> ProyectoRespuesta:
        return cls(
            id=p.id, nombre=p.nombre, requerimiento=p.requerimiento, ubicacion=p.ubicacion,
            presupuesto_referencial=p.presupuesto_referencial, estado=p.estado, creado=p.creado,
            motivo_de_cierre=p.motivo_de_cierre, moneda=p.moneda,
        )  # fmt: skip


class ErrorRespuesta(DtoSalida):
    codigo: str
    mensaje: str
    track_id: str
