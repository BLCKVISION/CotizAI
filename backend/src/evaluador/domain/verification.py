"""Control questions the rules could not answer, so that "no finding" is never shown as "verified"."""

from __future__ import annotations

from .extraccion import ExtraccionPropuesta
from .reglas.calidad import declares_new_equipment
from .reglas.capacidad import capacity_was_compared


def unverified_checks(extraction: ExtraccionPropuesta) -> tuple[str, ...]:
    """Finding codes without enough data. They never discard a proposal."""
    pending = []
    if not capacity_was_compared(extraction):
        pending.append("CAPACIDAD")
    if not declares_new_equipment(extraction):
        pending.append("CALIDAD")
    return tuple(pending)
