"""Chat with tool calling over any OpenAI-compatible API."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

import httpx

from evaluador.application.ports.assistant import ChatMessage, ToolCall, ToolSpec

from ._retry import post_with_retry

MAX_ANSWER_TOKENS = 2000


def _wire(message: ChatMessage) -> dict[str, Any]:
    data: dict[str, Any] = {"role": message.role, "content": message.content}
    if message.tool_calls:
        data["tool_calls"] = [
            {"id": c.id, "type": "function", "function": {"name": c.name, "arguments": c.arguments}}
            for c in message.tool_calls
        ]
    if message.tool_call_id:
        data["tool_call_id"] = message.tool_call_id
    return data


class OpenAICompatibleChat:
    def __init__(
        self, *, base_url: str, model: str, api_key: str = "", timeout: float = 90.0, client: httpx.Client | None = None
    ) -> None:
        headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
        self._http = client or httpx.Client(base_url=base_url.rstrip("/"), headers=headers, timeout=timeout)
        self._model = model

    def complete(self, messages: Sequence[ChatMessage], tools: Sequence[ToolSpec]) -> ChatMessage:
        payload: dict[str, Any] = {
            "model": self._model,
            "temperature": 0,
            "max_tokens": MAX_ANSWER_TOKENS,
            "messages": [_wire(m) for m in messages],
        }
        if tools:
            payload["tools"] = [
                {
                    "type": "function",
                    "function": {"name": t.name, "description": t.description, "parameters": t.parameters},
                }
                for t in tools
            ]
        response = post_with_retry(lambda: self._http.post("/chat/completions", json=payload))
        response.raise_for_status()
        message = response.json()["choices"][0]["message"]
        calls = tuple(
            ToolCall(
                id=str(c.get("id") or f"call-{n}"),
                name=str(c["function"]["name"]),
                arguments=str(c["function"].get("arguments") or "{}"),
            )
            for n, c in enumerate(message.get("tool_calls") or [])
        )
        return ChatMessage("assistant", str(message.get("content") or ""), calls)
