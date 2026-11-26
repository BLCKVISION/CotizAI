"""Lectura de XLSX con openpyxl: fórmulas, valores en caché, comentarios y filas, columnas u hojas ocultas.

No se ejecutan macros ni se siguen enlaces externos. Todo lo oculto se conserva en el texto (marcado `[OCULTO]`) y
se avisa: una instrucción escondida en una celda oculta debe llegar al detector de manipulación.
"""

from __future__ import annotations

import io
import zipfile
from typing import Any

from openpyxl import load_workbook
from openpyxl.utils import get_column_letter

from evaluador.application.ports.documents import ReadContent
from evaluador.domain.errors import InvalidData

MAX_CELLS = 200_000
MAX_DECOMPRESSED_BYTES = 50 * 1024 * 1024


def _verify_zip(data: bytes, max_decompressed: int) -> None:
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            names = {i.filename for i in z.infolist()}
            if sum(i.file_size for i in z.infolist()) > max_decompressed:
                raise InvalidData("El archivo XLSX descomprimido excede el tamaño permitido.")
    except zipfile.BadZipFile:
        raise InvalidData("El archivo no es un XLSX válido.") from None
    if "xl/vbaProject.bin" in names:
        raise InvalidData("No se aceptan libros con macros.")


def _hidden_columns(ws: Any) -> set[int]:
    hidden: set[int] = set()
    for dim in ws.column_dimensions.values():
        if dim.hidden and dim.min and dim.max:
            hidden.update(range(dim.min, min(dim.max, ws.max_column) + 1))
    return hidden


def _format(cell: Any, cached_value: Any) -> str:
    v = cell.value
    if isinstance(v, str) and v.startswith("="):
        return f"{v} (valor {cached_value})" if cached_value is not None else v
    return str(v) if v is not None else ""


def read_xlsx(
    data: bytes, *, max_cells: int = MAX_CELLS, max_decompressed_bytes: int = MAX_DECOMPRESSED_BYTES
) -> ReadContent:
    _verify_zip(data, max_decompressed_bytes)
    try:
        with_formulas = load_workbook(io.BytesIO(data), data_only=False, keep_vba=False, keep_links=False)
        with_values = load_workbook(io.BytesIO(data), data_only=True, keep_vba=False, keep_links=False)
    except Exception as exc:  # noqa: BLE001 - cualquier fallo del parser es un archivo inválido, sin detalle interno
        raise InvalidData("No se pudo abrir el XLSX.") from exc

    if sum(ws.max_row * ws.max_column for ws in with_formulas.worksheets) > max_cells:
        raise InvalidData("El XLSX excede el máximo de celdas permitido.")

    lines: list[str] = []
    notices: list[str] = []
    for ws in with_formulas.worksheets:
        values = with_values[ws.title]
        hidden_sheet = ws.sheet_state != "visible"
        lines.append(f"[Hoja{' OCULTA' if hidden_sheet else ''}: {ws.title}]")
        if hidden_sheet:
            notices.append(f"hoja oculta «{ws.title}» con contenido")
        hidden_cols = _hidden_columns(ws)
        rows_with_hidden: list[int] = []
        cols_with_hidden: set[int] = set()
        for row in ws.iter_rows():
            for c in row:
                text = _format(c, values[c.coordinate].value)
                note = f" | comentario ({c.comment.author}): {c.comment.text}" if c.comment else ""
                if not text and not note:
                    continue
                hidden_row = bool(ws.row_dimensions[c.row].hidden)
                hidden_col = c.column in hidden_cols
                if hidden_row and c.row not in rows_with_hidden:
                    rows_with_hidden.append(c.row)
                if hidden_col:
                    cols_with_hidden.add(c.column)
                marker = "[OCULTO] " if (hidden_row or hidden_col) and not hidden_sheet else ""
                lines.append(f"{marker}{c.coordinate}: {text}{note}")
        if rows_with_hidden:
            notices.append(f"fila oculta en «{ws.title}»: {', '.join(map(str, rows_with_hidden))}")
        if cols_with_hidden:
            letters = ", ".join(get_column_letter(i) for i in sorted(cols_with_hidden))
            notices.append(f"columna oculta en «{ws.title}»: {letters}")
    return ReadContent("\n".join(lines), notices)
