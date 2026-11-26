"""Cliente para cualquier API compatible con OpenAI: Ollama (gratis, local), vLLM, OpenRouter, LM Studio..."""

from __future__ import annotations

import httpx
from pydantic import BaseModel

from ._common import build_messages, extract_json, image_base64, system_for_image


class OpenAiCompatibleModel:
    def __init__(self, *, base_url: str, model: str, api_key: str = "", timeout: float = 120.0) -> None:
        hdr = {"Authorization": f"Bearer {api_key}"} if api_key else {}
        self._http = httpx.Client(base_url=base_url.rstrip("/"), headers=hdr, timeout=timeout)
        self._model = model

    def structure(self, *, instructions: str, untrusted_content: str, schema: type[BaseModel]):
        r = self._http.post(
            "/chat/completions",
            json={
                "model": self._model,
                "temperature": 0,
                "response_format": {"type": "json_object"},
                "messages": build_messages(instructions, untrusted_content, schema),
            },
        )
        r.raise_for_status()
        return schema.model_validate(extract_json(r.json()["choices"][0]["message"]["content"]))

    def structure_image(self, *, instructions: str, image: bytes, mime: str, schema: type[BaseModel]) -> BaseModel:
        url = f"data:{mime};base64,{image_base64(image)}"
        r = self._http.post(
            "/chat/completions",
            json={
                "model": self._model,
                "temperature": 0,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": system_for_image(instructions, schema)},
                    {"role": "user", "content": [
                        {"type": "text", "text": "Transcribe la imagen adjunta."},
                        {"type": "image_url", "image_url": {"url": url}}]},
                ],
            },
        )  # fmt: skip
        r.raise_for_status()
        return schema.model_validate(extract_json(r.json()["choices"][0]["message"]["content"]))
