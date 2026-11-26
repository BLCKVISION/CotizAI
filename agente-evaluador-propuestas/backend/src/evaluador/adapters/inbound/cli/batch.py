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

from evaluador.application.use_cases.batch import BatchResult, ProcessBatch
from evaluador.composition.settings import Settings

CHALLENGE = "propuesta_servicios"
_log = logging.getLogger("evaluador.lote")


class BatchError(Exception):
    """Fallo de arranque (sin repositorio, carpeta inexistente): el CLI sale con código distinto de cero."""


def _git(directory: Path, *args: str) -> str:
    try:
        r = subprocess.run(  # noqa: S603 - comando fijo, sin entrada del usuario
            ["git", "-C", str(directory), *args],  # noqa: S607
            capture_output=True,
            text=True,
            check=True,
            timeout=30,
        )
    except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired) as exc:
        raise BatchError(f"No se pudo ejecutar git {args[0]} en {directory}.") from exc
    return r.stdout.strip()


def _iso(t: datetime) -> str:
    return t.astimezone().isoformat(timespec="seconds")  # ISO 8601 con zona local, p. ej. -04:00


def _document(r: BatchResult, commit: str, repository: str) -> dict[str, Any]:
    """Solo la estructura pedida: sin contenido de propuestas ni detalles de error."""
    return {
        "reto": CHALLENGE,
        "repositorio": repository,
        "commit": commit,
        "inicio": _iso(r.start),
        "fin": _iso(r.end),
        "procesados": [{"archivo": p.file, "hora": _iso(p.timestamp)} for p in r.processed],
        "ranking": list(r.ranking),
    }


def _files(folder: Path) -> list[str]:
    if not folder.is_dir():
        raise BatchError(f"La carpeta del lote no existe: {folder}")
    return sorted(p.name for p in folder.iterdir() if p.is_file() and not p.name.startswith("."))


def _build_real(config: Settings, folder: Path) -> ProcessBatch:
    from evaluador.composition.batch import build_batch

    return build_batch(config, folder)


def main(
    argv: Sequence[str] | None = None,
    *,
    factory: Callable[..., ProcessBatch] | None = None,
    git_dir: Path | None = None,
) -> int:
    cfg = Settings()
    ap = argparse.ArgumentParser(prog="python -m evaluador.lote", description="Evalúa un lote de propuestas.")
    ap.add_argument(
        "--lote", dest="batch", required=True, type=Path, help="Carpeta con las propuestas (PDF, XLSX, imágenes)."
    )
    ap.add_argument("--salida", dest="output", required=True, type=Path, help="Ruta de salida.json.")
    ap.add_argument(
        "--paralelo", dest="parallel", type=int, default=cfg.batch_parallel, help="Archivos procesados a la vez."
    )
    ap.add_argument(
        "--reintentos", dest="retries", type=int, default=cfg.batch_retries, help="Reintentos por archivo que falla."
    )
    ap.add_argument(
        "--repositorio", dest="repository", default=cfg.batch_repository, help="Ruta/URL del repositorio del evento."
    )
    args = ap.parse_args(argv)

    logging.basicConfig(level=cfg.log_level, stream=sys.stderr, format="%(asctime)s %(levelname)s %(message)s")
    try:
        git = git_dir or Path.cwd()
        commit = _git(git, "rev-parse", "HEAD")
        if _git(git, "status", "--porcelain"):
            _log.warning("El árbol de trabajo tiene cambios sin confirmar: el commit de salida.json no los incluye.")
        repository = args.repository or _git(git, "remote", "get-url", "origin")
        files = _files(args.batch)
        cfg = cfg.model_copy(update={"batch_parallel": args.parallel, "batch_retries": args.retries})
        batch = factory(cfg) if factory else _build_real(cfg, args.batch)
        result = batch.execute(files)
    except BatchError as exc:
        _log.error("%s", exc)
        return 2
    args.output.write_text(json.dumps(_document(result, commit, repository), ensure_ascii=False, indent=2), "utf-8")
    failed = sum(1 for p in result.processed if p.error)
    _log.info("Lote terminado: %d archivos, %d pendientes por error. Salida: %s", len(files), failed, args.output)
    return 0
