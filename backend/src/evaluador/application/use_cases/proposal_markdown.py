"""The text of a stored proposal as Markdown, extracted according to its file type."""

from __future__ import annotations

from evaluador.application.ports.documentos import MarkdownDocument, MarkdownExtractor
from evaluador.application.use_cases.gestion import Gestion
from evaluador.domain.errores import DatoInvalido, ErrorDeDominio, ServicioNoDisponible
from evaluador.domain.identidad import Usuario


class GetProposalMarkdown:
    def __init__(self, management: Gestion, extract: MarkdownExtractor) -> None:
        self._management, self._extract = management, extract

    def execute(self, actor: Usuario, project_id: str, proposal_id: str) -> tuple[str, MarkdownDocument]:
        # Same permission and audit trail as downloading the file: the text is its content.
        proposal, content = self._management.descargar(actor, project_id, proposal_id)
        try:
            return proposal.archivo, self._extract(proposal.archivo, content)
        except ErrorDeDominio:
            raise
        except ValueError as error:
            raise DatoInvalido("No se pudo extraer el texto del archivo.") from error
        except Exception as error:  # noqa: BLE001 - provider details never reach the client
            raise ServicioNoDisponible("No se pudo extraer el texto en este momento. Reintente.") from error
