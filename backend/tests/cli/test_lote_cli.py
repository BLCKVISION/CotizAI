import json
import subprocess
from datetime import datetime
from decimal import Decimal

from evaluador.adapters.inbound.cli.lote import principal
from evaluador.application.use_cases.evaluar_archivo import Evaluacion
from evaluador.application.use_cases.lote import ProcesarLote
from evaluador.domain.evaluacion import ResultadoEvaluacion, Veredicto


class Siempre:
    def evaluar(self, *, propuesta_id, nombre, datos):
        if nombre.startswith("mala"):
            raise RuntimeError("x")
        return Evaluacion(ResultadoEvaluacion(propuesta_id, Veredicto.VALIDA), Decimal(50), None, None)


def repo(tmp_path):
    r = tmp_path / "repo"
    r.mkdir()
    git = lambda *a: subprocess.run(["git", "-C", str(r), *a], check=True, capture_output=True)  # noqa: E731, S603, S607
    git("init", "-q")
    git("config", "user.email", "t@t.t")
    git("config", "user.name", "t")
    (r / "f").write_text("1")
    git("add", ".")
    git("commit", "-qm", "c")
    git("remote", "add", "origin", "https://gitlab.example/evento/repo.git")
    sha = subprocess.run(
        ["git", "-C", str(r), "rev-parse", "HEAD"], capture_output=True, text=True, check=True
    ).stdout.strip()  # noqa: S603, S607
    return r, sha


def fabrica(config):
    return ProcesarLote(evaluador=Siempre(), cargar=lambda n: b"x", espera=lambda s: None, reintentos=1)


def test_genera_salida_json_con_la_estructura_pedida(tmp_path):
    r, sha = repo(tmp_path)
    lote = tmp_path / "lote"
    lote.mkdir()
    for n in ("Propuesta_1.pdf", "Propuesta_2.xlsx", "mala.png", ".oculto"):
        (lote / n).write_bytes(b"x")
    salida = tmp_path / "salida.json"
    codigo = principal(["--lote", str(lote), "--salida", str(salida)], fabrica=fabrica, directorio_git=r)
    d = json.loads(salida.read_text())
    assert codigo == 0
    assert set(d) == {"reto", "repositorio", "commit", "inicio", "fin", "procesados", "ranking"}
    assert d["reto"] == "propuesta_servicios" and d["commit"] == sha
    assert d["repositorio"] == "https://gitlab.example/evento/repo.git"
    assert sorted(p["archivo"] for p in d["procesados"]) == ["Propuesta_1.pdf", "Propuesta_2.xlsx", "mala.png"]
    assert d["ranking"][-1] == "mala" and len(d["ranking"]) == 3
    for campo in (d["inicio"], d["fin"], *(p["hora"] for p in d["procesados"])):
        assert datetime.fromisoformat(campo).tzinfo is not None  # ISO 8601 con zona


def test_falla_con_codigo_distinto_de_cero_si_no_hay_repositorio_git(tmp_path):
    lote = tmp_path / "lote"
    lote.mkdir()
    sin_git = tmp_path / "vacio"
    sin_git.mkdir()
    assert (
        principal(["--lote", str(lote), "--salida", str(tmp_path / "s.json")], fabrica=fabrica, directorio_git=sin_git)
        != 0
    )
    assert not (tmp_path / "s.json").exists()


def test_falla_si_la_carpeta_del_lote_no_existe(tmp_path):
    r, _ = repo(tmp_path)
    assert (
        principal(
            ["--lote", str(tmp_path / "no"), "--salida", str(tmp_path / "s.json")], fabrica=fabrica, directorio_git=r
        )
        != 0
    )
