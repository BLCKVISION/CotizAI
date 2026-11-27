"""Descarga de reportes de una evaluación.

CABLEADO: `app.state.container.export_report` debe ser un `ExportReport`; registrar `reports.router` bajo `/api/v1`.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Request, Response

from evaluador.adapters.inbound.http.dtos import ID_PATTERN
from evaluador.adapters.inbound.http.guards import require
from evaluador.application.use_cases.authentication import AuthenticatedSession
from evaluador.domain.identity import Permission

router = APIRouter(prefix="/evaluations", tags=["reports"])
EvaluationId = Annotated[str, Path(pattern=ID_PATTERN)]


@router.get("/{evaluation_id}/export")
def export_report(
    evaluation_id: EvaluationId,
    request: Request,
    session: Annotated[AuthenticatedSession, Depends(require(Permission.VIEW_RESULTS))],
    format: Annotated[str, Query(max_length=10, description="pdf, md, xlsx o csv")],  # noqa: A002 - nombre de la API
) -> Response:
    report = request.app.state.container.export_report.execute(session.user, evaluation_id, format)
    return Response(
        content=report.content,
        media_type=report.media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{report.filename}"',  # nombre ASCII saneado
            "X-Content-Type-Options": "nosniff",
        },
    )
