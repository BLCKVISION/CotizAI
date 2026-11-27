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
from evaluador.domain.errores import ErrorDeDominio

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
    if (carpeta / "propuestas").is_dir():
        raise ErrorDeLote(f"Esa es la carpeta del paquete: pase --lote {carpeta / 'propuestas'}")
    archivos = sorted(p.name for p in carpeta.iterdir() if p.is_file() and not p.name.startswith("."))
    if not archivos:
        raise ErrorDeLote(f"La carpeta del lote no tiene archivos: {carpeta}")
    return archivos


_MAX_REQUIREMENT_CHARS = 8_000


def _read_requirement(path: Path) -> str:
    """Project statement from a TXT/MD file or any document with a text layer (e.g. proyecto.pdf)."""
    if not path.is_file():
        raise ErrorDeLote(f"No existe el archivo del requerimiento: {path}")
    try:
        if path.suffix.lower() in {".txt", ".md"}:
            text = path.read_text("utf-8")
        else:
            from evaluador.adapters.outbound.extraccion.lector import leer_documento

            text = leer_documento(path.name, path.read_bytes()).texto
    except (ErrorDeDominio, UnicodeDecodeError) as exc:
        raise ErrorDeLote(f"No se pudo leer el requerimiento {path.name}: {exc}") from exc
    if not text.strip():
        raise ErrorDeLote(f"El requerimiento {path.name} no tiene texto legible (¿está escaneado?).")
    return text.strip()[:_MAX_REQUIREMENT_CHARS]


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
    ap.add_argument(
        "--requerimiento-archivo", type=Path, help="PDF o TXT con el requerimiento del proyecto (p. ej. proyecto.pdf)."
    )
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
        if args.requerimiento_archivo:
            cfg = cfg.model_copy(update={"lote_requerimiento": _read_requirement(args.requerimiento_archivo)})
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
