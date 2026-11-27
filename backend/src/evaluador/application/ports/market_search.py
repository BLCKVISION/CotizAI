"""Port for resolving market reference unit prices for proposal line items."""

from __future__ import annotations

from typing import Protocol

from evaluador.domain.extraccion import ExtraccionPropuesta
from evaluador.domain.reglas.abusivo import ReferenciaDeMercado


class MarketPriceFinder(Protocol):
    """Finds market reference prices keyed by 1-based line number in an extraction."""

    def find_references(self, extraction: ExtraccionPropuesta) -> dict[int, ReferenciaDeMercado]: ...
