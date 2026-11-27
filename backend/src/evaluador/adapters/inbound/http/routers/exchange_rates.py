"""Official BCV exchange rates with a manual fallback that records its source and date."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from pydantic import Field

from evaluador.adapters.inbound.http.dtos import DtoEntrada, DtoSalida
from evaluador.adapters.inbound.http.guards import exigir
from evaluador.application.use_cases.autenticacion import SesionAutenticada
from evaluador.domain.identidad import Permiso
from evaluador.domain.moneda import TasaDeCambio

router = APIRouter(prefix="/exchange-rates", tags=["exchange-rates"])


class ExchangeRateResponseDto(DtoSalida):
    base: str
    quote: str
    value: Decimal
    source: str
    effective_date: date
    origin: str

    @classmethod
    def from_domain(cls, rate: TasaDeCambio) -> ExchangeRateResponseDto:
        return cls(
            base=rate.de,
            quote=rate.a,
            value=rate.valor,
            source=rate.fuente,
            effective_date=rate.fecha,
            origin=rate.origen.value,
        )


class RegisterManualRateDto(DtoEntrada):
    base: Annotated[str, Field(pattern=r"^[A-Za-z]{3}$")]
    quote: Annotated[str, Field(pattern=r"^[A-Za-z]{3}$")]
    value: Annotated[Decimal, Field(gt=0, max_digits=18, decimal_places=6)]
    source: Annotated[str, Field(min_length=1, max_length=200)]
    effective_date: date


@router.get("")
def get_exchange_rates(
    request: Request,
    session: Annotated[SesionAutenticada, Depends(exigir(Permiso.VER_ESTADO))],
) -> list[ExchangeRateResponseDto]:
    rates = request.app.state.contenedor.resolve_rates.execute(session.tenant_id)
    return [ExchangeRateResponseDto.from_domain(r) for r in rates]


@router.post("", status_code=status.HTTP_201_CREATED)
def register_manual_rate(
    dto: RegisterManualRateDto,
    request: Request,
    session: Annotated[SesionAutenticada, Depends(exigir(Permiso.REGISTRAR_TASA))],
) -> ExchangeRateResponseDto:
    rate = request.app.state.contenedor.register_manual_rate.execute(
        session.usuario,
        base=dto.base,
        quote=dto.quote,
        value=dto.value,
        source=dto.source,
        effective_date=dto.effective_date,
    )
    return ExchangeRateResponseDto.from_domain(rate)
