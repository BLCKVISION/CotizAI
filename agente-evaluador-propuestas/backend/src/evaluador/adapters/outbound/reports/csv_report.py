"""CSV del ranking: una fila por propuesta. UTF-8 con BOM (Excel) y celdas de texto neutralizadas."""

from __future__ import annotations

import csv
import io

from evaluador.application.use_cases.export_report import RenderedReport, ReportInput

from ._content import NOT_DETERMINED, VERDICT_LABEL, build_model, discarding, is_plain_decimal, one_line

HEADER = ["Posición", "Propuesta", "Proveedor", "Veredicto", "Puntaje", "Moneda", "Costo", "Causas"]
_DANGEROUS_START = ("=", "+", "-", "@", "\t", "\r")


def neutralize(text: str | None) -> str:
    """Una celda de TEXTO que empiece como fórmula se antepone con `'` (OWASP). Los decimales simples no son texto."""
    t = one_line(text)
    if is_plain_decimal(t):
        return t
    return "'" + t if t.startswith(_DANGEROUS_START) else t


class CsvReport:
    def render(self, data: ReportInput) -> RenderedReport:
        model = build_model(data)
        buf = io.StringIO(newline="")
        writer = csv.writer(buf, delimiter=",", lineterminator="\r\n")
        writer.writerow(HEADER)
        for r in model.ranked:
            p = r.proposal
            writer.writerow([
                "" if r.position is None else r.position,
                neutralize(p.id),
                neutralize(p.supplier),
                VERDICT_LABEL[p.verdict],
                p.score or "",
                neutralize(p.currency),
                p.cost.total if p.cost.total is not None else NOT_DETERMINED,
                ";".join(f.code.value for f in discarding(p)),
            ])  # fmt: skip
        return RenderedReport(buf.getvalue().encode("utf-8-sig"), "text/csv; charset=utf-8", "csv")
