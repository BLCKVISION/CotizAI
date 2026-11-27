"""Cliente de la API de Claude (Messages). Sin herramientas habilitadas."""

from __future__ import annotations

import httpx
from pydantic import BaseModel

from ._comun import construir_mensajes, extraer_json, imagen_base64, sistema_para_imagen


class ModeloAnthropic:
    def __init__(self, *, modelo: str, api_key: str, timeout: float = 120.0) -> None:
        self._http = httpx.Client(
            base_url="https://api.anthropic.com",
            headers={"x-api-key": api_key, "anthropic-version": "2023-06-01"},
            timeout=timeout,
        )
        self._modelo = modelo

    def estructurar(
        self, *, instrucciones: str, contenido_no_confiable: str, esquema: type[BaseModel], temperature: float = 0
    ):
        sistema, usuario = construir_mensajes(instrucciones, contenido_no_confiable, esquema)
        r = self._http.post(
            "/v1/messages",
            json={"model": self._modelo, "max_tokens": 4096, "temperature": temperature,
                  "system": sistema["content"], "messages": [usuario]},
        )  # fmt: skip
        r.raise_for_status()
        return esquema.model_validate(extraer_json(r.json()["content"][0]["text"]))

    def estructurar_imagen(
        self, *, instrucciones: str, imagen: bytes, mime: str, esquema: type[BaseModel]
    ) -> BaseModel:
        r = self._http.post(
            "/v1/messages",
            json={"model": self._modelo, "max_tokens": 4096, "temperature": 0,
                  "system": sistema_para_imagen(instrucciones, esquema),
                  "messages": [{"role": "user", "content": [
                      {"type": "image", "source": {"type": "base64", "media_type": mime,
                                                "data": imagen_base64(imagen)}},
                      {"type": "text", "text": "Transcribe la imagen adjunta."}]}]},
        )  # fmt: skip
        r.raise_for_status()
        return esquema.model_validate(extraer_json(r.json()["content"][0]["text"]))
