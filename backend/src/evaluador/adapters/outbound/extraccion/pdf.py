"""Lectura de PDF con pdfplumber, separando el texto visible del oculto (diminuto o del color del fondo)."""

from __future__ import annotations

import io
from typing import Any

import pdfplumber

from evaluador.application.ports.documentos import ContenidoLeido
from evaluador.domain.errores import DatoInvalido

MAX_PAGINAS = 100
TAMANO_MINIMO_PT = 4.0  # por debajo de esto un humano no lo lee en una página normal


def _es_blanco(color: Any) -> bool:
    if not isinstance(color, (tuple, list)) or not color:
        return False
    if len(color) == 4:  # CMYK: sin tinta
        return all(c == 0 for c in color)
    return all(c == 1 for c in color)  # gris o RGB blanco


def _motivo_oculto(ch: dict[str, Any], pagina: Any) -> str | None:
    if ch["size"] < TAMANO_MINIMO_PT:
        return "diminuto"
    if _es_blanco(ch.get("non_stroking_color")):
        return "invisible"
    if ch["x1"] < 0 or ch["x0"] > pagina.width or ch["bottom"] < 0 or ch["top"] > pagina.height:
        return "fuera de la página"
    return None


def leer_pdf(datos: bytes, *, max_paginas: int = MAX_PAGINAS) -> ContenidoLeido:
    secciones: list[str] = []
    ocultos: list[str] = []
    avisos: list[str] = []
    try:
        with pdfplumber.open(io.BytesIO(datos)) as pdf:
            if len(pdf.pages) > max_paginas:
                raise DatoInvalido("El PDF excede el máximo de páginas permitido.")
            for n, pagina in enumerate(pdf.pages, start=1):
                motivos = {id(c): _motivo_oculto(c, pagina) for c in pagina.chars}
                visible = pagina.filter(lambda o, mt=motivos: o.get("object_type") != "char" or mt.get(id(o)) is None)
                texto = (visible.extract_text() or "").strip()
                if texto:
                    secciones.append(f"[p.{n}]\n{texto}")
                elif not pagina.chars:
                    avisos.append(f"p.{n} sin texto (¿escaneada?)")
                for motivo in sorted({m for m in motivos.values() if m}):
                    oculto = pagina.filter(
                        lambda o, m=motivo, mt=motivos: o.get("object_type") == "char" and mt.get(id(o)) == m
                    ).extract_text()
                    if oculto and oculto.strip():
                        ocultos.append(f"[OCULTO] [p.{n}] ({motivo}): {oculto.strip()}")
                        avisos.append(f"texto {motivo} en p.{n}")
    except DatoInvalido:
        raise
    except Exception as exc:  # noqa: BLE001 - PDF corrupto, cifrado o malicioso: error de archivo, sin detalle interno
        raise DatoInvalido("No se pudo leer el PDF.") from exc
    return ContenidoLeido("\n".join([*secciones, *ocultos]), avisos)
