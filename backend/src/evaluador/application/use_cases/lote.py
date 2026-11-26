"""Modo lote: procesa carpeta de propuestas en paralelo, con reintentos, y ordena el ranking.

Un archivo que falla tras los reintentos NO se omite ni se descarta: queda `pendiente_de_revision` y se ordena
después de las válidas. Los errores que no mejoran al repetir (`ErrorDeDominio`: tipo no admitido, archivo corrupto)
no se reintentan.
"""

from __future__ import annotations

import logging
import time
from collections import Counter
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from pathlib import PurePath

from evaluador.application.use_cases.evaluar_archivo import Evaluacion, EvaluadorDePropuesta
from evaluador.domain.errores import ErrorDeDominio
from evaluador.domain.evaluacion import Veredicto
from evaluador.domain.ranking import Candidata, ordenar_ranking

_log = logging.getLogger("evaluador.lote")


@dataclass(frozen=True, slots=True)
class Procesado:
    archivo: str
    propuesta_id: str
    hora: datetime  # fin del último intento
    veredicto: Veredicto
    intentos: int
    error: str | None = None  # sin contenido del documento: solo tipo de error o mensaje de dominio


@dataclass(frozen=True, slots=True)
class ResultadoLote:
    inicio: datetime
    fin: datetime
    procesados: tuple[Procesado, ...]
    ranking: tuple[str, ...]


def _ids_unicos(archivos: list[str]) -> list[str]:
    """Nombre sin extensión; si dos archivos lo comparten, se distinguen con su extensión (el ranking no repite)."""
    pilas = [PurePath(a) for a in archivos]
    cuenta = Counter(p.stem for p in pilas)
    ids = [p.stem if cuenta[p.stem] == 1 else f"{p.stem}_{p.suffix.lstrip('.').lower()}" for p in pilas]
    if len(set(ids)) != len(ids):  # caso extremo: A.pdf y A.PDF
        ids = [f"{i}~{n}" if ids.count(i) > 1 else i for n, i in enumerate(ids)]
    return ids


def _ahora() -> datetime:
    return datetime.now().astimezone()  # con zona horaria local (ISO 8601)


class ProcesarLote:
    def __init__(
        self,
        *,
        evaluador: EvaluadorDePropuesta,
        cargar: Callable[[str], bytes],
        reloj: Callable[[], datetime] = _ahora,
        espera: Callable[[float], None] = time.sleep,
        paralelo: int = 4,
        reintentos: int = 2,
        pausa_base_s: float = 1.0,
    ) -> None:
        self._evaluador, self._cargar, self._reloj, self._espera = evaluador, cargar, reloj, espera
        self._paralelo, self._reintentos, self._pausa = max(1, paralelo), max(0, reintentos), pausa_base_s

    def _procesar(self, archivo: str, propuesta_id: str) -> tuple[Procesado, Evaluacion | None]:
        error: str | None = None
        for intento in range(1, self._reintentos + 2):
            try:
                ev = self._evaluador.evaluar(propuesta_id=propuesta_id, nombre=archivo, datos=self._cargar(archivo))
                return Procesado(archivo, propuesta_id, self._reloj(), ev.resultado.veredicto, intento), ev
            except Exception as exc:  # noqa: BLE001 - un archivo no puede detener el lote
                determinista = isinstance(exc, ErrorDeDominio)
                error = str(exc) if determinista else type(exc).__name__  # nunca contenido del documento
                _log.warning("archivo_fallido", extra={"archivo": archivo, "intento": intento, "error": error})
                if determinista or intento > self._reintentos:
                    break
                self._espera(self._pausa * intento)
        pendiente = Procesado(archivo, propuesta_id, self._reloj(), Veredicto.PENDIENTE_DE_REVISION, intento, error)
        return pendiente, None

    def ejecutar(self, archivos: list[str]) -> ResultadoLote:
        inicio = self._reloj()
        ids = _ids_unicos(archivos)
        with ThreadPoolExecutor(max_workers=self._paralelo) as pool:
            salidas = list(pool.map(self._procesar, archivos, ids))
        evaluaciones = [e for _, e in salidas if e is not None and e.resultado.veredicto is Veredicto.VALIDA]
        # El costo solo desempata entre monedas iguales: sin tasa vigente no se comparan montos de monedas distintas.
        mono_moneda = len({e.moneda for e in evaluaciones}) <= 1
        candidatas = []
        for p, e in salidas:
            costo: Decimal | None = e.costo_real if (e and mono_moneda) else None
            veredicto = p.veredicto
            if veredicto is Veredicto.VALIDA and (e is None or e.puntaje is None):
                veredicto = Veredicto.PENDIENTE_DE_REVISION  # válida sin puntaje no se puede ordenar: revisión humana
            candidatas.append(Candidata(p.propuesta_id, veredicto, e.puntaje if e else None, costo))
        return ResultadoLote(inicio, self._reloj(), tuple(p for p, _ in salidas), ordenar_ranking(candidatas))
