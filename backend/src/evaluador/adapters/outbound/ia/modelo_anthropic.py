"""Cliente de la API de Claude (Messages). Sin herramientas habilitadas."""

from __future__ import annotations

import httpx
from pydantic import BaseModel

from ._comun import construir_mensajes, extraer_json


class ModeloAnthropic:
    def __init__(self, *, modelo: str, api_key: str, timeout: float = 120.0) -> None:
        self._http = httpx.Client(
            base_url="https://api.anthropic.com",
            headers={"x-api-key": api_key, "anthropic-version": "2023-06-01"},
            timeout=timeout,
        )
        self._modelo = modelo

    def estructurar(self, *, instrucciones: str, contenido_no_confiable: str, esquema: type[BaseModel]):
        sistema, usuario = construir_mensajes(instrucciones, contenido_no_confiable, esquema)
        r = self._http.post(
            "/v1/messages",
            json={"model": self._modelo, "max_tokens": 4096, "temperature": 0,
                  "system": sistema["content"], "messages": [usuario]},
        )  # fmt: skip
        r.raise_for_status()
        return esquema.model_validate(extraer_json(r.json()["content"][0]["text"]))
