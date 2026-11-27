"""Supplier directory: the registered record joined with what happened to each supplier in earlier evaluations."""

from __future__ import annotations

import unicodedata
from collections import Counter
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from .gestion import Proveedor
from .project_evaluation import ProjectEvaluation, ProposalEvaluationItem

_LEGAL_SUFFIXES = frozenset({"c", "a", "ca", "sa", "s", "srl", "rl", "inc", "llc"})


def supplier_key(name: str) -> str:
    """Same key for «Distribuidora Alfa, C.A.» and «DISTRIBUIDORA ALFA»."""
    plain = "".join(c for c in unicodedata.normalize("NFKD", name.lower()) if not unicodedata.combining(c))
    words = "".join(c if c.isalnum() else " " for c in plain).split()
    return " ".join(w for w in words if w not in _LEGAL_SUFFIXES)


@dataclass(frozen=True, slots=True)
class DiscardCause:
    code: str
    reason: str


@dataclass(frozen=True, slots=True)
class Participation:
    project_id: str
    project_name: str
    filename: str
    verdict: str
    position: int
    competitors: int
    cost: Decimal | None
    currency: str | None
    evaluated_at: datetime
    causes: tuple[DiscardCause, ...]


@dataclass(frozen=True, slots=True)
class SupplierAlert:
    code: str  # a finding code that discarded the supplier at least once
    times: int


@dataclass(frozen=True, slots=True)
class SupplierRecord:
    key: str
    name: str
    registration: Proveedor | None  # None: seen in a quote, nobody has filled in its record yet
    participations: tuple[Participation, ...]
    alerts: tuple[SupplierAlert, ...]


def _causes(item: ProposalEvaluationItem) -> tuple[DiscardCause, ...]:
    return tuple(DiscardCause(f.code, f.reason) for f in item.findings if f.discards)


def _participations(
    evaluations: Iterable[ProjectEvaluation], project_names: Mapping[str, str]
) -> dict[str, list[tuple[str, Participation]]]:
    found: dict[str, list[tuple[str, Participation]]] = {}
    for evaluation in evaluations:
        if evaluation.project_id not in project_names:
            continue
        for position, item in enumerate(evaluation.items, start=1):
            key = supplier_key(item.supplier or "")
            if not key:
                continue
            discards = item.verdict == "descartada"
            found.setdefault(key, []).append((
                item.supplier or "",
                Participation(
                    project_id=evaluation.project_id,
                    project_name=project_names[evaluation.project_id],
                    filename=item.filename,
                    verdict=item.verdict,
                    position=position,
                    competitors=len(evaluation.items),
                    cost=item.real_cost,
                    currency=item.currency,
                    evaluated_at=item.evaluated_at or evaluation.creado,
                    causes=_causes(item) if discards else (),
                ),
            ))  # fmt: skip
    return found


def _alerts(participations: Iterable[Participation]) -> tuple[SupplierAlert, ...]:
    """Counted once per quote: three arithmetic findings in one file are one incident."""
    times = Counter(code for p in participations for code in {c.code for c in p.causes})
    return tuple(SupplierAlert(code, n) for code, n in sorted(times.items(), key=lambda c: (-c[1], c[0])))


def build_directory(
    registered: Iterable[Proveedor], evaluations: Iterable[ProjectEvaluation], project_names: Mapping[str, str]
) -> list[SupplierRecord]:
    seen = _participations(evaluations, project_names)
    records: list[SupplierRecord] = []
    taken: set[str] = set()
    for supplier in registered:
        key = supplier_key(supplier.nombre)
        # Two records with the same name (different tax id) cannot both own the quotes: the first one does.
        mine = tuple(p for _, p in seen.get(key, [])) if key not in taken else ()
        taken.add(key)
        records.append(SupplierRecord(key, supplier.nombre, supplier, _newest_first(mine), _alerts(mine)))
    for key, entries in seen.items():
        if key in taken:
            continue
        ordered = _newest_first(p for _, p in entries)
        name = max(entries, key=lambda e: e[1].evaluated_at)[0]
        records.append(SupplierRecord(key, name, None, ordered, _alerts(ordered)))
    return sorted(records, key=lambda r: r.name.lower())


def _newest_first(participations: Iterable[Participation]) -> tuple[Participation, ...]:
    return tuple(sorted(participations, key=lambda p: p.evaluated_at, reverse=True))
