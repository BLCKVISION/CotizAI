"""Lectura de PDF con pdfplumber, separando el texto visible del oculto (diminuto o del color del fondo)."""

from __future__ import annotations

import io
from typing import Any

import pdfplumber

from evaluador.application.ports.documents import ReadContent
from evaluador.domain.errors import InvalidData

MAX_PAGES = 100
MIN_SIZE_PT = 4.0  # por debajo de esto un humano no lo lee en una página normal


def _is_white(color: Any) -> bool:
    if not isinstance(color, (tuple, list)) or not color:
        return False
    if len(color) == 4:  # CMYK: sin tinta
        return all(c == 0 for c in color)
    return all(c == 1 for c in color)  # gris o RGB blanco


def _hidden_reason(ch: dict[str, Any], page: Any) -> str | None:
    if ch["size"] < MIN_SIZE_PT:
        return "tiny"
    if _is_white(ch.get("non_stroking_color")):
        return "invisible"
    if ch["x1"] < 0 or ch["x0"] > page.width or ch["bottom"] < 0 or ch["top"] > page.height:
        return "fuera de la página"
    return None


def read_pdf(data: bytes, *, max_pages: int = MAX_PAGES) -> ReadContent:
    sections: list[str] = []
    hidden: list[str] = []
    notices: list[str] = []
    try:
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            if len(pdf.pages) > max_pages:
                raise InvalidData("El PDF excede el máximo de páginas permitido.")
            for n, page in enumerate(pdf.pages, start=1):
                reasons = {id(c): _hidden_reason(c, page) for c in page.chars}
                visible = page.filter(lambda o, mt=reasons: o.get("object_type") != "char" or mt.get(id(o)) is None)
                text = (visible.extract_text() or "").strip()
                if text:
                    sections.append(f"[p.{n}]\n{text}")
                elif not page.chars:
                    notices.append(f"p.{n} sin texto (¿escaneada?)")
                for reason in sorted({m for m in reasons.values() if m}):
                    hidden_text = page.filter(
                        lambda o, m=reason, mt=reasons: o.get("object_type") == "char" and mt.get(id(o)) == m
                    ).extract_text()
                    if hidden_text and hidden_text.strip():
                        hidden.append(f"[OCULTO] [p.{n}] ({reason}): {hidden_text.strip()}")
                        notices.append(f"texto {reason} en p.{n}")
    except InvalidData:
        raise
    except Exception as exc:  # noqa: BLE001 - PDF corrupto, cifrado o malicioso: error de archivo, sin detalle interno
        raise InvalidData("No se pudo leer el PDF.") from exc
    return ReadContent("\n".join([*sections, *hidden]), notices)
