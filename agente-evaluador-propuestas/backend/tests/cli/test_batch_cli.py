import json
import subprocess
from datetime import datetime
from decimal import Decimal

from evaluador.adapters.inbound.cli.batch import main
from evaluador.application.use_cases.batch import ProcessBatch
from evaluador.application.use_cases.evaluate_file import Evaluation
from evaluador.domain.evaluation import EvaluationResult, Verdict


class Always:
    def evaluate(self, *, proposal_id, name, data):
        if name.startswith("mala"):
            raise RuntimeError("x")
        return Evaluation(EvaluationResult(proposal_id, Verdict.VALID), Decimal(50), None, None)


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


def factory(config):
    return ProcessBatch(evaluador=Always(), load=lambda n: b"x", wait=lambda s: None, retries=1)


def test_generates_json_output_with_the_requested_structure(tmp_path):
    r, sha = repo(tmp_path)
    batch = tmp_path / "lote"
    batch.mkdir()
    for n in ("Propuesta_1.pdf", "Propuesta_2.xlsx", "mala.png", ".oculto"):
        (batch / n).write_bytes(b"x")
    output = tmp_path / "salida.json"
    code = main(["--lote", str(batch), "--salida", str(output)], factory=factory, git_dir=r)
    d = json.loads(output.read_text())
    assert code == 0
    assert set(d) == {"reto", "repositorio", "commit", "inicio", "fin", "procesados", "ranking"}
    assert d["reto"] == "propuesta_servicios" and d["commit"] == sha
    assert d["repositorio"] == "https://gitlab.example/evento/repo.git"
    assert sorted(p["archivo"] for p in d["procesados"]) == ["Propuesta_1.pdf", "Propuesta_2.xlsx", "mala.png"]
    assert d["ranking"][-1] == "mala" and len(d["ranking"]) == 3
    for field in (d["inicio"], d["fin"], *(p["hora"] for p in d["procesados"])):
        assert datetime.fromisoformat(field).tzinfo is not None  # ISO 8601 con zona


def test_fails_with_nonzero_code_when_there_is_no_git_repository(tmp_path):
    batch = tmp_path / "lote"
    batch.mkdir()
    no_git = tmp_path / "vacio"
    no_git.mkdir()
    assert main(["--lote", str(batch), "--salida", str(tmp_path / "s.json")], factory=factory, git_dir=no_git) != 0
    assert not (tmp_path / "s.json").exists()


def test_fails_if_the_batch_folder_does_not_exist(tmp_path):
    r, _ = repo(tmp_path)
    assert main(["--lote", str(tmp_path / "no"), "--salida", str(tmp_path / "s.json")], factory=factory, git_dir=r) != 0
