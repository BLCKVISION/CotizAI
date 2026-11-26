"""Cliente para cualquier API compatible con OpenAI: Ollama (gratis, local), vLLM, OpenRouter, LM Studio..."""

from __future__ import annotations

import httpx
from pydantic import BaseModel

from ._comun import construir_mensajes, extraer_json, imagen_base64, sistema_para_imagen


class ModeloOpenAICompatible:
    def __init__(self, *, base_url: str, modelo: str, api_key: str = "", timeout: float = 120.0) -> None:
        cab = {"Authorization": f"Bearer {api_key}"} if api_key else {}
        self._http = httpx.Client(base_url=base_url.rstrip("/"), headers=cab, timeout=timeout)
        self._modelo = modelo

    def estructurar(self, *, instrucciones: str, contenido_no_confiable: str, esquema: type[BaseModel]):
        r = self._http.post(
            "/chat/completions",
            json={
                "model": self._modelo,
                "temperature": 0,
                "response_format": {"type": "json_object"},
                "messages": construir_mensajes(instrucciones, contenido_no_confiable, esquema),
            },
        )
        r.raise_for_status()
        return esquema.model_validate(extraer_json(r.json()["choices"][0]["message"]["content"]))

    def estructurar_imagen(
        self, *, instrucciones: str, imagen: bytes, mime: str, esquema: type[BaseModel]
    ) -> BaseModel:
        url = f"data:{mime};base64,{imagen_base64(imagen)}"
        r = self._http.post(
            "/chat/completions",
            json={
                "model": self._modelo,
                "temperature": 0,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": sistema_para_imagen(instrucciones, esquema)},
                    {"role": "user", "content": [
                        {"type": "text", "text": "Transcribe la imagen adjunta."},
                        {"type": "image_url", "image_url": {"url": url}}]},
                ],
            },
        )  # fmt: skip
        r.raise_for_status()
        return esquema.model_validate(extraer_json(r.json()["choices"][0]["message"]["content"]))
