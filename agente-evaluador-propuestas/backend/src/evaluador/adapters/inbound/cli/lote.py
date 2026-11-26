"""CLI del modo lote: `python -m evaluador.lote --lote ./lote --salida ./salida.json`. Sin UI ni base de datos."""

from __future__ import annotations

import argparse
import json
import logging
import subprocess
import sys
from collections.abc import Callable, Sequence
from datetime import datetime
from pathlib import Path
from typing import Any

from evaluador.application.use_cases.lote import ProcesarLote, ResultadoLote
from evaluador.composition.configuracion import Configuracion

RETO = "propuesta_servicios"
_log = logging.getLogger("evaluador.lote")


class ErrorDeLote(Exception):
    """Fallo de arranque (sin repositorio, carpeta inexistente): el CLI sale con código distinto de cero."""


def _git(directorio: Path, *args: str) -> str:
    try:
        r = subprocess.run(  # noqa: S603 - comando fijo, sin entrada del usuario
            ["git", "-C", str(directorio), *args],  # noqa: S607
            capture_output=True,
            text=True,
            check=True,
            timeout=30,
        )
    except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired) as exc:
        raise ErrorDeLote(f"No se pudo ejecutar git {args[0]} en {directorio}.") from exc
    return r.stdout.strip()


def _iso(t: datetime) -> str:
    return t.astimezone().isoformat(timespec="seconds")  # ISO 8601 con zona local, p. ej. -04:00


def _documento(r: ResultadoLote, commit: str, repositorio: str) -> dict[str, Any]:
    """Solo la estructura pedida: sin contenido de propuestas ni detalles de error."""
    return {
        "reto": RETO,
        "repositorio": repositorio,
        "commit": commit,
        "inicio": _iso(r.inicio),
        "fin": _iso(r.fin),
        "procesados": [{"archivo": p.archivo, "hora": _iso(p.hora)} for p in r.procesados],
        "ranking": list(r.ranking),
    }


def _archivos(carpeta: Path) -> list[str]:
    if not carpeta.is_dir():
        raise ErrorDeLote(f"La carpeta del lote no existe: {carpeta}")
    return sorted(p.name for p in carpeta.iterdir() if p.is_file() and not p.name.startswith("."))


def _construir_real(config: Configuracion, carpeta: Path) -> ProcesarLote:
    from evaluador.composition.lote import construir_lote

    return construir_lote(config, carpeta)


def principal(
    argv: Sequence[str] | None = None,
    *,
    fabrica: Callable[..., ProcesarLote] | None = None,
    directorio_git: Path | None = None,
) -> int:
    cfg = Configuracion()
    ap = argparse.ArgumentParser(prog="python -m evaluador.lote", description="Evalúa un lote de propuestas.")
    ap.add_argument("--lote", required=True, type=Path, help="Carpeta con las propuestas (PDF, XLSX, imágenes).")
    ap.add_argument("--salida", required=True, type=Path, help="Ruta de salida.json.")
    ap.add_argument("--paralelo", type=int, default=cfg.lote_paralelo, help="Archivos procesados a la vez.")
    ap.add_argument("--reintentos", type=int, default=cfg.lote_reintentos, help="Reintentos por archivo que falla.")
    ap.add_argument("--repositorio", default=cfg.lote_repositorio, help="Ruta/URL del repositorio del evento.")
    args = ap.parse_args(argv)

    logging.basicConfig(level=cfg.nivel_de_log, stream=sys.stderr, format="%(asctime)s %(levelname)s %(message)s")
    try:
        git = directorio_git or Path.cwd()
        commit = _git(git, "rev-parse", "HEAD")
        if _git(git, "status", "--porcelain"):
            _log.warning("El árbol de trabajo tiene cambios sin confirmar: el commit de salida.json no los incluye.")
        repositorio = args.repositorio or _git(git, "remote", "get-url", "origin")
        archivos = _archivos(args.lote)
        cfg = cfg.model_copy(update={"lote_paralelo": args.paralelo, "lote_reintentos": args.reintentos})
        lote = fabrica(cfg) if fabrica else _construir_real(cfg, args.lote)
        resultado = lote.ejecutar(archivos)
    except ErrorDeLote as exc:
        _log.error("%s", exc)
        return 2
    args.salida.write_text(
        json.dumps(_documento(resultado, commit, repositorio), ensure_ascii=False, indent=2), "utf-8"
    )
    fallidos = sum(1 for p in resultado.procesados if p.error)
    _log.info("Lote terminado: %d archivos, %d pendientes por error. Salida: %s", len(archivos), fallidos, args.salida)
    return 0
