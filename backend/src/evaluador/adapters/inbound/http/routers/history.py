"""Past evaluation runs with their reports, and the supplier directory with its background."""

from __future__ import annotations

from dataclasses import asdict
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Query, Request, Response

from evaluador.adapters.inbound.http.guards import sesion_actual
from evaluador.adapters.inbound.http.routers.proyectos import ProyectoId
from evaluador.adapters.outbound.reportes.assistant_report import ReportFileRenderer
from evaluador.application.ports.assistant import REPORT_MEDIA_TYPES
from evaluador.application.use_cases.autenticacion import SesionAutenticada
from evaluador.domain.supplier_history import SupplierRecord

router = APIRouter(tags=["history"])
Session = Annotated[SesionAutenticada, Depends(sesion_actual)]  # each use case checks the permission


def _record(record: SupplierRecord) -> dict[str, Any]:
    registration = record.registration
    return {
        "key": record.key,
        "name": record.name,
        "registration": None
        if registration is None
        else {"id": registration.id, "tax_id": registration.rif, "location": registration.ubicacion,
              "contact": registration.contacto},
        "participations": [asdict(p) for p in record.participations],
        "alerts": [asdict(a) for a in record.alerts],
    }  # fmt: skip


@router.get("/suppliers/history")
def supplier_directory(request: Request, session: Session) -> dict[str, Any]:
    directory = request.app.state.contenedor.supplier_directory.execute(session.usuario)
    return {"restricted": directory.restricted, "suppliers": [_record(r) for r in directory.records]}


@router.get("/proyectos/{proyecto_id}/evaluation-runs")
def evaluation_runs(proyecto_id: ProyectoId, request: Request, session: Session) -> list[dict[str, Any]]:
    return [asdict(r) for r in request.app.state.contenedor.evaluation_history.list(session.usuario, proyecto_id)]


@router.get("/proyectos/{proyecto_id}/evaluation-runs/{run_id}/report")
def run_report(
    proyecto_id: ProyectoId,
    run_id: ProyectoId,
    request: Request,
    session: Session,
    fmt: Annotated[Literal["pdf", "xlsx", "md", "csv"], Query()] = "pdf",
) -> Response:
    container = request.app.state.contenedor
    run = container.evaluation_history.run(session.usuario, proyecto_id, run_id)
    project = container.obtener_proyecto.ejecutar(session.usuario, proyecto_id)
    return Response(
        ReportFileRenderer().evaluation(run, project.nombre, fmt),
        media_type=REPORT_MEDIA_TYPES[fmt],
        headers={"Content-Disposition": f'attachment; filename="informe-{run.creado:%Y%m%d-%H%M}.{fmt}"'},
    )
