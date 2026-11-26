"""Cliente de la API de Claude (Messages). Sin herramientas habilitadas."""

from __future__ import annotations

import httpx
from pydantic import BaseModel

from ._common import build_messages, extract_json, image_base64, system_for_image


class AnthropicModel:
    def __init__(self, *, model: str, api_key: str, timeout: float = 120.0) -> None:
        self._http = httpx.Client(
            base_url="https://api.anthropic.com",
            headers={"x-api-key": api_key, "anthropic-version": "2023-06-01"},
            timeout=timeout,
        )
        self._model = model

    def structure(self, *, instructions: str, untrusted_content: str, schema: type[BaseModel]):
        system, user = build_messages(instructions, untrusted_content, schema)
        r = self._http.post(
            "/v1/messages",
            json={"model": self._model, "max_tokens": 4096, "temperature": 0,
                  "system": system["content"], "messages": [user]},
        )  # fmt: skip
        r.raise_for_status()
        return schema.model_validate(extract_json(r.json()["content"][0]["text"]))

    def structure_image(self, *, instructions: str, image: bytes, mime: str, schema: type[BaseModel]) -> BaseModel:
        r = self._http.post(
            "/v1/messages",
            json={"model": self._model, "max_tokens": 4096, "temperature": 0,
                  "system": system_for_image(instructions, schema),
                  "messages": [{"role": "user", "content": [
                      {"type": "image", "source": {"type": "base64", "media_type": mime,
                                                "data": image_base64(image)}},
                      {"type": "text", "text": "Transcribe la imagen adjunta."}]}]},
        )  # fmt: skip
        r.raise_for_status()
        return schema.model_validate(extract_json(r.json()["content"][0]["text"]))
