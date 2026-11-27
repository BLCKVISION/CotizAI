"""The text of a stored proposal as Markdown, extracted according to its file type."""

from __future__ import annotations

import threading
from collections import OrderedDict

from evaluador.application.ports.documentos import MarkdownDocument, MarkdownExtractor
from evaluador.application.use_cases.gestion import Gestion
from evaluador.domain.errores import DatoInvalido, ErrorDeDominio, ServicioNoDisponible
from evaluador.domain.identidad import Usuario

_CACHE_SIZE = 100


class GetProposalMarkdown:
    def __init__(self, management: Gestion, extract: MarkdownExtractor) -> None:
        self._management, self._extract = management, extract
        # In memory only: the text is as sensitive as the encrypted file. It spares a second OCR or AI reading.
        self._cache: OrderedDict[tuple[str, str], MarkdownDocument] = OrderedDict()
        self._lock = threading.Lock()

    def execute(self, actor: Usuario, project_id: str, proposal_id: str) -> tuple[str, MarkdownDocument]:
        # Same permission and audit trail as downloading the file: the text is its content.
        proposal, content = self._management.descargar(actor, project_id, proposal_id)
        key = (actor.tenant_id, proposal.sha256)
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)
                return proposal.archivo, self._cache[key]
        try:
            document = self._extract(proposal.archivo, content)
        except ErrorDeDominio:
            raise
        except ValueError as error:
            raise DatoInvalido("No se pudo extraer el texto del archivo.") from error
        except Exception as error:  # noqa: BLE001 - provider details never reach the client
            raise ServicioNoDisponible("No se pudo extraer el texto en este momento. Reintente.") from error
        with self._lock:
            self._cache[key] = document
            while len(self._cache) > _CACHE_SIZE:
                self._cache.popitem(last=False)
        return proposal.archivo, document
