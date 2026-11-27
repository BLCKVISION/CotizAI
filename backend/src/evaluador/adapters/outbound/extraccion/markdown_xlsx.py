"""XLSX to Markdown with openpyxl: one table per sheet, keeping cell addresses, formulas and hidden content."""

from __future__ import annotations

import re

from .xlsx import leer_xlsx

_SHEET = re.compile(r"^\[Hoja( OCULTA)?: (.*)\]$")
_CELL = re.compile(r"^(\[OCULTO\] )?([A-Z]+)(\d+): (.*)$")


def _column_number(letters: str) -> int:
    number = 0
    for letter in letters:
        number = number * 26 + ord(letter) - 64
    return number


def _table(cells: dict[int, dict[str, str]]) -> str:
    columns = sorted({c for row in cells.values() for c in row}, key=_column_number)
    lines = ["| Fila | " + " | ".join(columns) + " |", "|" + " --- |" * (len(columns) + 1)]
    for number in sorted(cells):
        lines.append(f"| {number} | " + " | ".join(cells[number].get(c, "") for c in columns) + " |")
    return "\n".join(lines)


def xlsx_to_markdown(data: bytes) -> tuple[str, list[str]]:
    # The reader already enforces size limits, refuses macros and marks what is hidden: only the layout changes.
    content = leer_xlsx(data)
    sheets: list[tuple[str, dict[int, dict[str, str]]]] = []
    last: tuple[int, str] | None = None
    for line in content.texto.split("\n"):
        if sheet := _SHEET.match(line):
            sheets.append((f"## Hoja: {sheet.group(2)}{' (oculta)' if sheet.group(1) else ''}", {}))
            last = None
        elif (cell := _CELL.match(line)) and sheets:
            hidden, column, row, value = cell.groups()
            last = (int(row), column)
            sheets[-1][1].setdefault(int(row), {})[column] = f"{hidden or ''}{value}".replace("|", "\\|")
        elif last and sheets:  # a cell or comment with line breaks continues the previous one
            sheets[-1][1][last[0]][last[1]] += " " + line.replace("|", "\\|")
    blocks = [f"{title}\n\n{_table(cells) if cells else '_Sin contenido._'}" for title, cells in sheets]
    return "\n\n".join(blocks), list(content.avisos)
