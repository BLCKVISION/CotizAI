"""`build_worker`: el paso del worker se arma sobre la misma base de datos que usa la API."""

import pytest

from evaluador.adapters.outbound.ai.fake_embedder import FakeEmbedder
from evaluador.adapters.outbound.ai.fake_model import FakeModel
from evaluador.composition.settings import Settings
from evaluador.composition.worker import build_worker


def test_the_worker_requires_sql_persistence_because_it_shares_the_queue_with_the_api():
    with pytest.raises(RuntimeError, match="PERSISTENCIA"):
        build_worker(Settings(log_level="CRITICAL"), model=FakeModel({}), embedder=FakeEmbedder(), wait=lambda s: None)


def test_with_an_empty_queue_the_step_returns_none(tmp_path):
    config = Settings(log_level="CRITICAL", persistence="sql", database_url=f"sqlite:///{tmp_path / 'w.db'}")
    step = build_worker(config, model=FakeModel({}), embedder=FakeEmbedder(), wait=lambda s: None)
    assert step.execute() is None


def test_the_worker_takes_the_job_queued_through_the_api(tmp_path):
    from fastapi.testclient import TestClient

    from evaluador.adapters.inbound.http.app import create_app
    from evaluador.composition.container import build_container
    from tests.adapters.test_container_wiring import new_project, seed, upload, xlsx
    from tests.conftest import header

    config = Settings(log_level="CRITICAL", persistence="sql", database_url=f"sqlite:///{tmp_path / 'w.db'}")
    api = TestClient(create_app(config, seed(build_container(config=config))))
    project = new_project(api)
    for i in range(3):
        assert upload(api, project, name=f"p{i}.xlsx", data=xlsx(rows=i + 1)).status_code == 201
    started = api.post(f"/api/v1/projects/{project}/evaluations", headers=header(api, role="evaluator"))
    assert started.status_code == 202

    claimed = build_worker(config, model=FakeModel({}), embedder=FakeEmbedder()).execute()

    assert claimed is not None and claimed.id == started.json()["id"]  # el worker ve el trabajo que encoló la API
