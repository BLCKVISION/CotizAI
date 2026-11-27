"""Cliente para cualquier API compatible con OpenAI: Ollama (gratis, local), vLLM, OpenRouter, LM Studio..."""

from __future__ import annotations

import json
import logging

import httpx
from pydantic import BaseModel

from ._comun import construir_mensajes, imagen_base64, sistema_para_imagen, validate_reply
from ._retry import post_with_retry

# Without a cap the provider reserves the model's whole output window and may refuse a low-credit account (402).
MAX_ANSWER_TOKENS = 8000
_log = logging.getLogger("evaluador.ia")


class ModeloOpenAICompatible:
    def __init__(self, *, base_url: str, modelo: str, api_key: str = "", timeout: float = 120.0) -> None:
        cab = {"Authorization": f"Bearer {api_key}"} if api_key else {}
        self._http = httpx.Client(base_url=base_url.rstrip("/"), headers=cab, timeout=timeout)
        self._modelo = modelo

    def estructurar(
        self, *, instrucciones: str, contenido_no_confiable: str, esquema: type[BaseModel], temperature: float = 0
    ):
        r = post_with_retry(lambda: self._http.post(
            "/chat/completions",
            json={
                "model": self._modelo,
                "temperature": temperature,
                "max_tokens": MAX_ANSWER_TOKENS,
                "response_format": {"type": "json_object"},
                "messages": construir_mensajes(instrucciones, contenido_no_confiable, esquema),
            },
        ))
        r.raise_for_status()
        choice = r.json()["choices"][0]
        try:
            return validate_reply(choice["message"]["content"] or "", esquema)
        except (ValueError, json.JSONDecodeError):
            # finish_reason "length" means the answer was cut off by the token cap: the JSON is incomplete, not wrong.
            _log.warning("respuesta_no_valida", extra={"finish_reason": choice.get("finish_reason"), "caracteres": len(choice["message"]["content"] or "")})
            raise

    def estructurar_imagen(
        self, *, instrucciones: str, imagen: bytes, mime: str, esquema: type[BaseModel]
    ) -> BaseModel:
        url = f"data:{mime};base64,{imagen_base64(imagen)}"
        r = post_with_retry(lambda: self._http.post(
            "/chat/completions",
            json={
                "model": self._modelo,
                "temperature": 0,
                "max_tokens": MAX_ANSWER_TOKENS,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": sistema_para_imagen(instrucciones, esquema)},
                    {"role": "user", "content": [
                        {"type": "text", "text": "Transcribe la imagen adjunta."},
                        {"type": "image_url", "image_url": {"url": url}}]},
                ],
            },
        ))  # fmt: skip
        r.raise_for_status()
        return validate_reply(r.json()["choices"][0]["message"]["content"], esquema)
