"""API tests for project evaluations, exchange rates, report and questions (offline: fake model and embedder)."""

from __future__ import annotations

import base64
import re
import threading
from datetime import UTC, date, datetime
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from evaluador.adapters.inbound.http.aplicacion import crear_aplicacion
from evaluador.adapters.outbound.ia.embebedor_falso import EmbebedorFalso
from evaluador.application.use_cases.evaluate_project import GroundedAnswer
from evaluador.composition.ai import build_services
from evaluador.composition.configuracion import Configuracion
from evaluador.composition.contenedor import construir_contenedor
from evaluador.domain.errores import TasaNoDisponible
from evaluador.domain.extraccion import (
    Condiciones,
    Evidencia,
    ExtraccionPropuesta,
    JuicioDeAlcance,
    Linea,
    Monto,
    Totales,
    TranscripcionImagen,
)
from evaluador.domain.identidad import Rol, Tenant, Usuario
from evaluador.domain.puntaje import PuntajeCriterio, RubricaPuntuada
from tests.conftest import CLAVE, cabecera

NEW_PROJECT = {
    "nombre": "Laboratorio 11 PCs",
    "requerimiento": "11 computadoras con monitor, teclado, raton y UPS, instalacion, garantia y soporte.",
    "ubicacion": "Caracas",
    "moneda": "USD",
    "presupuesto_referencial": "7000",
}
_CATEGORIES = (("gabinete", 500), ("monitor", 100), ("teclado", 10), ("raton", 10), ("protector", 50))


def _amount(value: object) -> Monto:
    return Monto(literal=str(value), valor=str(value))


def _extraction(supplier: str, currency: str, total_error: bool) -> ExtraccionPropuesta:
    lines = [
        Linea(
            descripcion=name,
            categoria=name,
            cantidad=_amount(11),
            precio_unitario=_amount(price),
            total_linea=_amount(11 * price + (900 if total_error and name == "gabinete" else 0)),
            evidencia=Evidencia(pagina_o_celda="p.1", texto=f"{name} x11"),
        )
        for name, price in _CATEGORIES
    ]
    total = sum(Decimal(line.total_linea.valor) for line in lines if line.total_linea)
    return ExtraccionPropuesta(
        proveedor=supplier,
        moneda=currency,
        lineas=lines,
        totales=Totales(subtotal=_amount(total), total=_amount(total)),
        condiciones=Condiciones(garantia="12 meses", soporte="12 meses"),
    )


class FakeModel:
    """Decides from markers in the document text: SUPPLIER=…, CURRENCY=…, BADMATH, BOOM (provider failure)."""

    def __init__(self) -> None:
        self.down = False
        self.gate: threading.Event | None = None

    def estructurar(self, *, instrucciones: str, contenido_no_confiable: str, esquema):
        if self.down:
            raise ConnectionError("provider unreachable")
        if self.gate is not None:
            self.gate.wait(5)
        if esquema is ExtraccionPropuesta:
            supplier = re.search(r"SUPPLIER=(\w+)", contenido_no_confiable)
            currency = re.search(r"CURRENCY=(\S+)", contenido_no_confiable)
            assert supplier and currency
            return _extraction(supplier[1], currency[1], "BADMATH" in contenido_no_confiable)
        if esquema is JuicioDeAlcance:
            return JuicioDeAlcance(cumple=True, faltantes=[], evidencia=["instalacion"])
        if esquema is RubricaPuntuada:
            if "BOOM" in contenido_no_confiable:
                raise ConnectionError("rubric timeout")
            score = PuntajeCriterio(puntaje=95 if "SUPPLIER=Beta" in contenido_no_confiable else 80, evidencia=["i5"])
            return RubricaPuntuada(rendimiento=score, proteccion_y_perifericos=score, garantia_y_soporte=score)
        if esquema is GroundedAnswer:
            return GroundedAnswer(answer="Alfa es la propuesta válida.", sources=[1, 1, 999])
        raise AssertionError(esquema)

    def estructurar_imagen(self, **_):
        return TranscripcionImagen(texto="SUPPLIER=Foto CURRENCY=USD 11 equipos instalacion garantia")


class NoBcv:
    def fetch(self):
        raise TasaNoDisponible("offline")


def _pdf(text: str) -> bytes:
    stream = f"BT /F1 10 Tf 20 750 Td ({text}) Tj ET".encode()
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length %d >>\nstream\n%s\nendstream" % (len(stream), stream),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out, offsets = bytearray(b"%PDF-1.4\n"), []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += b"%d 0 obj\n%s\nendobj\n" % (number, body)
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    out += b"".join(b"%010d 00000 n \n" % o for o in offsets)
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objects) + 1, xref)
    return bytes(out)


@pytest.fixture
def model() -> FakeModel:
    return FakeModel()


@pytest.fixture
def app_client(tmp_path, model):
    config = Configuracion(
        nivel_de_log="CRITICAL",
        persistencia="memoria",
        clave_cifrado=base64.b64encode(b"k" * 32).decode(),
        directorio_documentos=str(tmp_path),
        semilla_clave=None,
        usuario_demo_correo=None,
    )
    services = build_services(config, model, EmbebedorFalso())
    container = construir_contenedor(config=config, ai_services=lambda: services, rate_source=NoBcv())
    hashed = container.hasheador.hashear(CLAVE)
    for code in ("alfa", "beta"):
        container.tenants.guardar(Tenant(id=f"t-{code}", codigo=code, nombre=code))
        for role in Rol:
            container.usuarios.guardar(
                Usuario(
                    id=f"{code}-{role}", tenant_id=f"t-{code}", correo=f"{role}@{code}.test",
                    hash_contrasena=hashed, rol=role,
                )
            )  # fmt: skip
    return TestClient(crear_aplicacion(config, container))


DEFAULT_FILES = {
    "alfa.pdf": "SUPPLIER=Alfa CURRENCY=USD instalacion garantia soporte equipos nuevos",
    "beta.pdf": "SUPPLIER=Beta CURRENCY=Bs. instalacion garantia soporte equipos nuevos",
    "gamma.pdf": "SUPPLIER=Gamma CURRENCY=USD BADMATH instalacion garantia soporte",
}


def _project(client: TestClient, files: dict[str, str] = DEFAULT_FILES, name: str = "Laboratorio") -> str:
    headers = cabecera(client, rol="cargador")
    project = client.post("/api/v1/proyectos", json=NEW_PROJECT | {"nombre": name}, headers=headers).json()
    for filename, text in files.items():
        r = client.post(
            f"/api/v1/proyectos/{project['id']}/propuestas?archivo={filename}",
            content=_pdf(text),
            headers=headers | {"Content-Type": "application/octet-stream"},
        )
        assert r.status_code == 201, r.text
    return project["id"]


def _evaluate(client: TestClient, project_id: str, role: str = "evaluador"):
    return client.post(f"/api/v1/proyectos/{project_id}/evaluations", headers=cabecera(client, rol=role))


def _register_rate(client: TestClient) -> None:
    payload = {"base": "USD", "quote": "VES", "value": "50", "source": "Oficio BCV",
               "effective_date": datetime.now(UTC).date().isoformat()}  # fmt: skip
    assert client.post("/api/v1/exchange-rates", json=payload, headers=cabecera(client, rol="evaluador")).is_success


def _state(client: TestClient, project_id: str) -> str:
    return client.get(f"/api/v1/proyectos/{project_id}", headers=cabecera(client)).json()["estado"]


def test_full_flow_ranks_converts_discards_and_moves_to_committee(app_client):
    _register_rate(app_client)
    pid = _project(app_client)
    r = _evaluate(app_client, pid)
    assert r.status_code == 201, r.text
    body = r.json()
    items = {i["filename"]: i for i in body["items"]}
    assert [i["filename"] for i in body["items"]] == ["beta.pdf", "alfa.pdf", "gamma.pdf"]
    assert items["gamma.pdf"]["verdict"] == "descartada"
    assert "ARITMETICA" in {f["code"] for f in items["gamma.pdf"]["findings"]}
    # "Bs." is understood as VES and converted with the registered rate; the original amount is kept.
    assert items["beta.pdf"]["currency"] == "VES"
    assert Decimal(items["beta.pdf"]["converted_cost"]) == Decimal(items["beta.pdf"]["real_cost"]) / 50
    assert body["exchange_rates"][0]["origin"] == "manual"
    assert items["alfa.pdf"]["cost_steps"][0]["concept"] == "Monto base"
    assert sum(c["weight"] for c in items["alfa.pdf"]["criteria"]) == 100
    assert items["alfa.pdf"]["over_budget"] is True  # 7370 > 7000
    assert _state(app_client, pid) == "en_revision_del_comite"
    audit = app_client.get("/api/v1/auditoria", headers=cabecera(app_client, rol="auditor")).json()
    assert audit["integra"] is True
    actions = [e["accion"] for e in audit["eventos"]]
    assert "evaluation_completed" in actions and "propuesta_descargada" not in actions


def test_uploader_can_start_but_never_sees_results(app_client):
    pid = _project(app_client)
    r = _evaluate(app_client, pid, role="cargador")
    assert r.status_code == 201
    assert r.json()["restricted"] is True and r.json()["evaluated_count"] == 3
    assert r.json()["items"] == [] and r.json()["ranking"] == []
    for path in ("evaluations", "evaluations/report"):
        assert app_client.get(f"/api/v1/proyectos/{pid}/{path}", headers=cabecera(app_client)).status_code == 403


def test_missing_rate_is_reported_and_nothing_is_invented(app_client):
    pid = _project(app_client)
    body = _evaluate(app_client, pid).json()
    beta = next(i for i in body["items"] if i["filename"] == "beta.pdf")
    assert beta["converted_cost"] is None and beta["real_cost"] is not None
    assert "tasa" in body["warnings"][0].lower()
    assert app_client.get("/api/v1/exchange-rates", headers=cabecera(app_client)).status_code == 503


def test_one_failing_file_does_not_stop_the_others(app_client):
    pid = _project(app_client, DEFAULT_FILES | {"delta.pdf": "SUPPLIER=Delta CURRENCY=USD BOOM instalacion garantia"})
    body = _evaluate(app_client, pid).json()
    verdicts = {i["filename"]: i["verdict"] for i in body["items"]}
    assert verdicts["delta.pdf"] == "pendiente_de_revision" and verdicts["alfa.pdf"] == "valida"


def test_ai_outage_saves_nothing_and_restores_reception(app_client, model):
    pid = _project(app_client)
    model.down = True
    assert _evaluate(app_client, pid).status_code == 503
    assert _state(app_client, pid) == "en_recepcion"
    headers = cabecera(app_client, rol="evaluador")
    assert app_client.get(f"/api/v1/proyectos/{pid}/evaluations", headers=headers).status_code == 404


def test_needs_three_proposals(app_client):
    pid = _project(app_client, {"alfa.pdf": DEFAULT_FILES["alfa.pdf"]})
    assert _evaluate(app_client, pid).status_code == 422
    assert _state(app_client, pid) == "en_recepcion"


def test_reevaluation_is_allowed_in_review_but_not_after_closing(app_client):
    pid = _project(app_client)
    assert _evaluate(app_client, pid).status_code == 201
    assert _evaluate(app_client, pid).status_code == 201
    closed = app_client.post(
        f"/api/v1/proyectos/{pid}/transiciones",
        json={"destino": "cerrado", "motivo": "fin"},
        headers=cabecera(app_client, rol="aprobador"),
    )
    assert closed.is_success, closed.text
    assert _evaluate(app_client, pid).status_code == 409


def test_concurrent_evaluation_of_the_same_project_is_rejected(app_client, model):
    pid = _project(app_client)
    model.gate = threading.Event()
    headers = cabecera(app_client, rol="evaluador")
    results: list[int] = []
    first = threading.Thread(
        target=lambda: results.append(
            app_client.post(f"/api/v1/proyectos/{pid}/evaluations", headers=headers).status_code
        )
    )
    first.start()
    for _ in range(500):
        if _state(app_client, pid) == "en_evaluacion":
            break
    second = app_client.post(f"/api/v1/proyectos/{pid}/evaluations", headers=headers)
    model.gate.set()
    first.join(10)
    assert second.status_code == 409 and results == [201]


def test_other_tenants_get_404_everywhere(app_client):
    pid = _project(app_client)
    _evaluate(app_client, pid)
    beta = cabecera(app_client, "beta", "evaluador")
    base = f"/api/v1/proyectos/{pid}"
    assert app_client.get(f"{base}/evaluations", headers=beta).status_code == 404
    assert app_client.get(f"{base}/evaluations/report", headers=beta).status_code == 404
    assert app_client.post(f"{base}/evaluations", headers=beta).status_code == 404
    assert app_client.post(f"{base}/ask", json={"question": "¿Cuál gana?"}, headers=beta).status_code == 404


def test_report_downloads_in_both_formats(app_client):
    pid = _project(app_client)
    _evaluate(app_client, pid)
    headers = cabecera(app_client, rol="aprobador")
    markdown = app_client.get(f"/api/v1/proyectos/{pid}/evaluations/report", headers=headers)
    assert "Recomendación" in markdown.text and "paso a paso" in markdown.text
    assert "attachment" in markdown.headers["content-disposition"]
    sheet = app_client.get(f"/api/v1/proyectos/{pid}/evaluations/report?fmt=csv", headers=headers)
    assert len(sheet.text.strip().splitlines()) == 4
    assert app_client.get(f"/api/v1/proyectos/{pid}/evaluations/report?fmt=exe", headers=headers).status_code == 422


def test_questions_return_only_real_citations(app_client):
    pid = _project(app_client)
    _evaluate(app_client, pid)
    r = app_client.post(
        f"/api/v1/proyectos/{pid}/ask",
        json={"question": "¿Cuál es válida?"},
        headers=cabecera(app_client, rol="evaluador"),
    )
    assert r.status_code == 200, r.text
    assert [c["number"] for c in r.json()["citations"]] == [1]  # duplicates and invented numbers dropped


def test_supplier_discarded_before_is_flagged(app_client):
    _evaluate(app_client, _project(app_client, name="Primero"))
    body = _evaluate(app_client, _project(app_client, name="Segundo")).json()
    gamma = next(i for i in body["items"] if i["filename"] == "gamma.pdf")
    assert gamma["supplier_history"] == ["Descartado en «Primero» por ARITMETICA."]


def test_manual_rate_needs_permission_and_rejects_future_dates(app_client):
    payload = {"base": "USD", "quote": "VES", "value": "45.5", "source": "Manual", "effective_date": "2099-01-01"}
    assert app_client.post("/api/v1/exchange-rates", json=payload, headers=cabecera(app_client)).status_code == 403
    evaluator = cabecera(app_client, rol="evaluador")
    assert app_client.post("/api/v1/exchange-rates", json=payload, headers=evaluator).status_code == 422
    payload["effective_date"] = date(2026, 1, 1).isoformat()
    assert app_client.post("/api/v1/exchange-rates", json=payload, headers=evaluator).status_code == 201
