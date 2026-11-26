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

from evaluador.application.ports.documentos import ContenidoLeido
from evaluador.domain.errores import DatoInvalido

MAX_CELDAS = 200_000
MAX_BYTES_DESCOMPRIMIDOS = 50 * 1024 * 1024


def _verificar_zip(datos: bytes, max_descomprimidos: int) -> None:
    try:
        with zipfile.ZipFile(io.BytesIO(datos)) as z:
            nombres = {i.filename for i in z.infolist()}
            if sum(i.file_size for i in z.infolist()) > max_descomprimidos:
                raise DatoInvalido("El archivo XLSX descomprimido excede el tamaño permitido.")
    except zipfile.BadZipFile:
        raise DatoInvalido("El archivo no es un XLSX válido.") from None
    if "xl/vbaProject.bin" in nombres:
        raise DatoInvalido("No se aceptan libros con macros.")


def _columnas_ocultas(ws: Any) -> set[int]:
    ocultas: set[int] = set()
    for dim in ws.column_dimensions.values():
        if dim.hidden and dim.min and dim.max:
            ocultas.update(range(dim.min, min(dim.max, ws.max_column) + 1))
    return ocultas


def _formatear(celda: Any, valor_cache: Any) -> str:
    v = celda.value
    if isinstance(v, str) and v.startswith("="):
        return f"{v} (valor {valor_cache})" if valor_cache is not None else v
    return str(v) if v is not None else ""


def leer_xlsx(
    datos: bytes, *, max_celdas: int = MAX_CELDAS, max_bytes_descomprimidos: int = MAX_BYTES_DESCOMPRIMIDOS
) -> ContenidoLeido:
    _verificar_zip(datos, max_bytes_descomprimidos)
    try:
        con_formulas = load_workbook(io.BytesIO(datos), data_only=False, keep_vba=False, keep_links=False)
        con_valores = load_workbook(io.BytesIO(datos), data_only=True, keep_vba=False, keep_links=False)
    except Exception as exc:  # noqa: BLE001 - cualquier fallo del parser es un archivo inválido, sin detalle interno
        raise DatoInvalido("No se pudo abrir el XLSX.") from exc

    if sum(ws.max_row * ws.max_column for ws in con_formulas.worksheets) > max_celdas:
        raise DatoInvalido("El XLSX excede el máximo de celdas permitido.")

    lineas: list[str] = []
    avisos: list[str] = []
    for ws in con_formulas.worksheets:
        valores = con_valores[ws.title]
        hoja_oculta = ws.sheet_state != "visible"
        lineas.append(f"[Hoja{' OCULTA' if hoja_oculta else ''}: {ws.title}]")
        if hoja_oculta:
            avisos.append(f"hoja oculta «{ws.title}» con contenido")
        cols_ocultas = _columnas_ocultas(ws)
        filas_con_oculto: list[int] = []
        cols_con_oculto: set[int] = set()
        for fila in ws.iter_rows():
            for c in fila:
                texto = _formatear(c, valores[c.coordinate].value)
                nota = f" | comentario ({c.comment.author}): {c.comment.text}" if c.comment else ""
                if not texto and not nota:
                    continue
                fila_oculta = bool(ws.row_dimensions[c.row].hidden)
                col_oculta = c.column in cols_ocultas
                if fila_oculta and c.row not in filas_con_oculto:
                    filas_con_oculto.append(c.row)
                if col_oculta:
                    cols_con_oculto.add(c.column)
                marca = "[OCULTO] " if (fila_oculta or col_oculta) and not hoja_oculta else ""
                lineas.append(f"{marca}{c.coordinate}: {texto}{nota}")
        if filas_con_oculto:
            avisos.append(f"fila oculta en «{ws.title}»: {', '.join(map(str, filas_con_oculto))}")
        if cols_con_oculto:
            letras = ", ".join(get_column_letter(i) for i in sorted(cols_con_oculto))
            avisos.append(f"columna oculta en «{ws.title}»: {letras}")
    return ContenidoLeido("\n".join(lineas), avisos)
