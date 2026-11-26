"""Modelo determinista para pruebas y demos sin red."""

from __future__ import annotations

from collections.abc import Callable

from pydantic import BaseModel


class FakeModel:
    def __init__(self, responses: dict[type[BaseModel], Callable[[str], BaseModel] | BaseModel]) -> None:
        self._responses = responses
        self.calls: list[tuple[str, str]] = []
        self.image_calls: list[tuple[str, str]] = []  # (instrucciones, mime)

    def structure(self, *, instructions: str, untrusted_content: str, schema: type[BaseModel]):
        self.calls.append((instructions, untrusted_content))
        r = self._responses[schema]
        return r(untrusted_content) if callable(r) else r

    def structure_image(self, *, instructions: str, image: bytes, mime: str, schema: type[BaseModel]) -> BaseModel:
        self.image_calls.append((instructions, mime))
        r = self._responses[schema]
        return r(image.decode("latin-1")) if callable(r) else r
