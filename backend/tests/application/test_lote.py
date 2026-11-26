import threading
import time
from datetime import UTC, datetime
from decimal import Decimal

from evaluador.application.use_cases.evaluar_archivo import Evaluacion
from evaluador.application.use_cases.lote import ProcesarLote
from evaluador.domain.errores import DatoInvalido
from evaluador.domain.evaluacion import ResultadoEvaluacion, Veredicto


def ev(nombre: str, veredicto=Veredicto.VALIDA, puntaje="80", costo=None) -> Evaluacion:
    return Evaluacion(
        ResultadoEvaluacion(nombre, veredicto), Decimal(puntaje) if veredicto is Veredicto.VALIDA else None,
        Decimal(costo) if costo else None, "USD",
    )  # fmt: skip


class Falso:
    """Evaluador programable: `plan[propuesta_id]` es una lista de respuestas o excepciones, una por intento."""

    def __init__(self, plan: dict, demora: float = 0.0) -> None:
        self.plan, self.intentos, self.demora = plan, {}, demora
        self.activos = self.max_activos = 0
        self._cerrojo = threading.Lock()

    def evaluar(self, *, propuesta_id: str, nombre: str, datos: bytes) -> Evaluacion:
        with self._cerrojo:
            self.intentos[propuesta_id] = self.intentos.get(propuesta_id, 0) + 1
            n = self.intentos[propuesta_id]
            self.activos += 1
            self.max_activos = max(self.max_activos, self.activos)
        try:
            time.sleep(self.demora)
            r = self.plan.get(propuesta_id, [ev(propuesta_id)])
            r = r[min(n, len(r)) - 1]
            if isinstance(r, Exception):
                raise r
            return r
        finally:
            with self._cerrojo:
                self.activos -= 1


def lote(evaluador, **kw) -> ProcesarLote:
    return ProcesarLote(
        evaluador=evaluador, cargar=lambda n: b"x", reloj=lambda: datetime.now(UTC), espera=lambda s: None, **kw
    )


def test_procesa_cada_archivo_y_el_ranking_usa_nombre_sin_extension():
    r = lote(Falso({"A": [ev("A", puntaje="90")], "B": [ev("B", puntaje="70")]})).ejecutar(["A.pdf", "B.xlsx"])
    assert [p.archivo for p in r.procesados] == ["A.pdf", "B.xlsx"]
    assert r.ranking == ("A", "B")


def test_reintenta_y_continua_si_un_archivo_falla():
    f = Falso({"A": [RuntimeError("caído"), RuntimeError("caído"), ev("A")]})
    r = lote(f, reintentos=2).ejecutar(["A.pdf", "B.pdf"])
    assert f.intentos["A"] == 3 and r.ranking == ("A", "B") and r.procesados[0].error is None


def test_si_agota_reintentos_va_a_pendiente_despues_de_las_validas_sin_omitirse():
    f = Falso({"A": [RuntimeError("caído")], "B": [ev("B", puntaje="10")], "C": [ev("C", Veredicto.DESCARTADA)]})
    r = lote(f, reintentos=1).ejecutar(["A.pdf", "B.pdf", "C.pdf"])
    assert f.intentos["A"] == 2
    assert r.ranking == ("B", "A", "C")  # válidas, pendiente (el fallido), descartadas
    a = r.procesados[0]
    assert a.veredicto is Veredicto.PENDIENTE_DE_REVISION and a.error == "RuntimeError" and a.intentos == 2


def test_error_de_archivo_invalido_no_se_reintenta_y_no_filtra_contenido():
    f = Falso({"A": [DatoInvalido("Tipo de archivo no admitido.")]})
    r = lote(f, reintentos=3).ejecutar(["A.txt"])
    assert f.intentos["A"] == 1 and r.procesados[0].error == "Tipo de archivo no admitido."
    assert r.ranking == ("A",)


def test_procesa_en_paralelo_con_limite_configurable():
    f = Falso({}, demora=0.05)
    archivos = [f"P{i}.pdf" for i in range(8)]
    lote(f, paralelo=3).ejecutar(archivos)
    assert f.max_activos == 3
    f2 = Falso({}, demora=0.01)
    lote(f2, paralelo=1).ejecutar(archivos)
    assert f2.max_activos == 1


def test_registra_hora_de_fin_de_cada_intento_e_inicio_fin_del_lote():
    r = lote(Falso({})).ejecutar(["A.pdf"])
    assert r.inicio <= r.procesados[0].hora <= r.fin and r.procesados[0].hora.tzinfo is not None


def test_nombres_repetidos_sin_extension_no_repiten_en_el_ranking():
    r = lote(Falso({})).ejecutar(["A.pdf", "A.xlsx"])
    assert len(set(r.ranking)) == 2 and set(r.ranking) == {"A_pdf", "A_xlsx"}


def test_equivalencia_tecnica_desempata_por_costo_solo_si_misma_moneda():
    def plan(moneda_b):
        return Falso({
            "A": [Evaluacion(ResultadoEvaluacion("A", Veredicto.VALIDA), Decimal(81), Decimal(900), "USD")],
            "B": [Evaluacion(ResultadoEvaluacion("B", Veredicto.VALIDA), Decimal(79), Decimal(800), moneda_b)],
        })  # fmt: skip

    assert lote(plan("USD")).ejecutar(["A.pdf", "B.pdf"]).ranking == ("B", "A")  # a ≤ δ puntos gana el más barato
    assert lote(plan("VES")).ejecutar(["A.pdf", "B.pdf"]).ranking == ("A", "B")  # monedas distintas: manda el puntaje


def test_sin_archivos_da_lote_vacio():
    r = lote(Falso({})).ejecutar([])
    assert r.procesados == () and r.ranking == ()
