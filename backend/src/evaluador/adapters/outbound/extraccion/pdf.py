"""Lectura de PDF con pdfplumber, separando el texto visible del oculto (diminuto o del color del fondo)."""

from __future__ import annotations

import io
from dataclasses import dataclass
from typing import Any

import pdfplumber

from evaluador.application.ports.documentos import ContenidoLeido
from evaluador.domain.errores import DatoInvalido

from .pdf_layers import lines_in_drawing_order, runs_of, split_overlaps

MAX_PAGINAS = 100
TAMANO_MINIMO_PT = 4.0  # por debajo de esto un humano no lo lee en una página normal
_DARK_BELOW = 0.6  # luminance of a background on which white text can be read


def _es_blanco(color: Any) -> bool:
    if not isinstance(color, (tuple, list)) or not color:
        return False
    if len(color) == 4:  # CMYK: sin tinta
        return all(c == 0 for c in color)
    return all(c == 1 for c in color)  # gris o RGB blanco


def _luminance(color: Any) -> float:
    if isinstance(color, (int, float)):
        return float(color)
    if not isinstance(color, (tuple, list)) or not all(isinstance(c, (int, float)) for c in color):
        return 1.0  # unknown pattern: assume a light background, so the text stays flagged
    if len(color) == 1:
        return float(color[0])
    if len(color) == 3:
        return 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2]
    if len(color) == 4:
        return (1 - color[3]) * (1 - (0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2]))
    return 1.0


def _on_dark_background(ch: dict[str, Any], pagina: Any) -> bool:
    """White text printed on a coloured band, such as a table header, is perfectly visible."""
    x, y = (ch["x0"] + ch["x1"]) / 2, (ch["top"] + ch["bottom"]) / 2
    behind = [r for r in pagina.rects if r.get("fill") and r["x0"] <= x <= r["x1"] and r["top"] <= y <= r["bottom"]]
    # The last one drawn is the one on top.
    return bool(behind) and _luminance(behind[-1].get("non_stroking_color")) < _DARK_BELOW


def _motivo_oculto(ch: dict[str, Any], pagina: Any) -> str | None:
    if ch["size"] < TAMANO_MINIMO_PT:
        return "diminuto"
    if _es_blanco(ch.get("non_stroking_color")) and not _on_dark_background(ch, pagina):
        return "invisible"
    if ch["x1"] < 0 or ch["x0"] > pagina.width or ch["bottom"] < 0 or ch["top"] > pagina.height:
        return "fuera de la página"
    return None


@dataclass(frozen=True, slots=True)
class PageLayers:
    """One page split into what a person reads, what is drawn over it and what is hidden."""

    visible: Any  # the page with only the first visible layer
    overlaid: list[str]
    hidden: dict[str, list[str]]  # reason -> lines


def split_page(page: Any) -> PageLayers:
    reasons = {id(c): _motivo_oculto(c, page) for c in page.chars}
    shown = runs_of([c for c in page.chars if reasons[id(c)] is None])
    first, over = split_overlaps(shown)
    keep = {id(c) for run in first for c in run.chars}
    visible = page.filter(lambda o: o.get("object_type") != "char" or id(o) in keep)
    hidden = {
        reason: lines_in_drawing_order(runs_of([c for c in page.chars if reasons[id(c)] == reason]))
        for reason in sorted({r for r in reasons.values() if r})
    }
    return PageLayers(visible, lines_in_drawing_order(over), hidden)


def leer_pdf(datos: bytes, *, max_paginas: int = MAX_PAGINAS) -> ContenidoLeido:
    secciones: list[str] = []
    superpuestos: list[str] = []
    ocultos: list[str] = []
    avisos: list[str] = []
    scanned: list[int] = []
    try:
        with pdfplumber.open(io.BytesIO(datos)) as pdf:
            if len(pdf.pages) > max_paginas:
                raise DatoInvalido("El PDF excede el máximo de páginas permitido.")
            for n, pagina in enumerate(pdf.pages, start=1):
                layers = split_page(pagina)
                texto = (layers.visible.extract_text() or "").strip()
                if texto:
                    secciones.append(f"[p.{n}]\n{texto}")
                elif not pagina.chars:
                    avisos.append(f"p.{n} sin texto (¿escaneada?)")
                    if pagina.images or pagina.curves or pagina.rects:  # a truly blank page has nothing to read
                        scanned.append(n)
                if layers.overlaid:
                    superpuestos.append(f"[SUPERPUESTO] [p.{n}]: " + "\n".join(layers.overlaid))
                    avisos.append(f"texto superpuesto sobre otro en p.{n}")
                for motivo, lineas in layers.hidden.items():
                    if lineas:
                        ocultos.append(f"[OCULTO] [p.{n}] ({motivo}): " + "\n".join(lineas))
                        avisos.append(f"texto {motivo} en p.{n}")
    except DatoInvalido:
        raise
    except Exception as exc:  # noqa: BLE001 - PDF corrupto, cifrado o malicioso: error de archivo, sin detalle interno
        raise DatoInvalido("No se pudo leer el PDF.") from exc
    return ContenidoLeido("\n".join([*secciones, *superpuestos, *ocultos]), avisos, scanned_pages=tuple(scanned))
