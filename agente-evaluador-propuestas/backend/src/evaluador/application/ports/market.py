"""Puerto de precios de mercado. Las referencias son datos externos: se citan, nunca se obedecen."""

from __future__ import annotations

from typing import Protocol

from evaluador.domain.market import PriceQuery, PriceReference


class MarketPriceSource(Protocol):
    def lookup(self, query: PriceQuery) -> list[PriceReference]:
        """Referencias de precio unitario para el componente. Lista vacía si no hay o la fuente está deshabilitada.
        Puede lanzar ante un fallo de red: el motor lo trata como «sin referencia», nunca como error de la propuesta."""
        ...
