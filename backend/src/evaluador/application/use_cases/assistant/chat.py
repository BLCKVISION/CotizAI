"""One conversation turn of the assistant: screen the message, let the engine work with tools, verify the answer."""

from __future__ import annotations

import logging
import secrets
import threading
from collections import OrderedDict
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Protocol

from evaluador.application.ports.assistant import ChatMessage, ChatModel, ToolCall, ToolSpec
from evaluador.application.ports.salida import Auditoria, GeneradorDeIds, Reloj, TenantRepositorio
from evaluador.application.use_cases.assistant.prompt import SCOPE_INSTRUCTIONS, build_system_prompt
from evaluador.application.use_cases.assistant.tools import AssistantTools, GeneratedReport, TurnArtifacts
from evaluador.domain.assistant.guardrails import (
    MAX_MESSAGE_CHARS,
    REFUSALS,
    AnswerCheck,
    RefusalCategory,
    check_answer,
    neutralise_delimiters,
    parse_scope_label,
    screen_user_message,
)
from evaluador.domain.errores import DatoInvalido, ErrorDeDominio, ServicioNoDisponible
from evaluador.domain.identidad import Permiso, Usuario

_log = logging.getLogger("evaluador.assistant")
MAX_HISTORY_TURNS = 6
MAX_CONVERSATIONS = 500


@dataclass(frozen=True, slots=True)
class TurnHooks:
    """What the engine needs from the application. The engine only decides the order of the steps."""

    screen: Callable[[], RefusalCategory | None]
    complete: Callable[[Sequence[ChatMessage], bool], ChatMessage]  # (messages, tools allowed)
    run_tool: Callable[[ToolCall], str]
    verify: Callable[[str], AnswerCheck]


@dataclass(frozen=True, slots=True)
class EngineResult:
    answer: str
    refusal: RefusalCategory | None = None


class AssistantEngine(Protocol):
    def run(self, messages: Sequence[ChatMessage], hooks: TurnHooks) -> EngineResult: ...


@dataclass(frozen=True, slots=True)
class AssistantServices:
    chat: ChatModel


@dataclass(frozen=True, slots=True)
class AssistantReply:
    conversation_id: str
    answer: str
    refusal: str | None
    tools_used: tuple[str, ...]
    links: tuple[str, ...]
    reports: tuple[GeneratedReport, ...]


class ConversationMemory:
    """Kept on the server so a caller cannot forge what the assistant said. Bounded and per user."""

    def __init__(self) -> None:
        self._items: OrderedDict[tuple[str, str, str], tuple[tuple[str, str], ...]] = OrderedDict()
        self._lock = threading.Lock()

    def get(self, key: tuple[str, str, str]) -> tuple[tuple[str, str], ...]:
        with self._lock:
            return self._items.get(key, ())

    def add(self, key: tuple[str, str, str], question: str, answer: str) -> None:
        with self._lock:
            self._items[key] = (*self._items.get(key, ()), (question, answer))[-MAX_HISTORY_TURNS:]
            self._items.move_to_end(key)
            while len(self._items) > MAX_CONVERSATIONS:
                self._items.popitem(last=False)


class AskAssistant:
    def __init__(
        self,
        *,
        tools: AssistantTools,
        engine: AssistantEngine,
        services: Callable[[], AssistantServices],
        tenants: TenantRepositorio,
        clock: Reloj,
        ids: GeneradorDeIds,
        audit: Auditoria,
        memory: ConversationMemory | None = None,
    ) -> None:
        self._tools, self._engine, self._services = tools, engine, services
        self._tenants, self._clock, self._ids, self._audit = tenants, clock, ids, audit
        self._memory = memory or ConversationMemory()

    def execute(self, actor: Usuario, message: str, conversation_id: str | None = None) -> AssistantReply:
        actor.exigir(Permiso.VER_RESULTADOS)
        message = message.strip()
        if not message:
            raise DatoInvalido("Escriba una consulta.")
        if len(message) > MAX_MESSAGE_CHARS:
            raise DatoInvalido(f"La consulta supera los {MAX_MESSAGE_CHARS} caracteres.")
        conversation_id = conversation_id or self._ids.nuevo()
        key = (actor.tenant_id, actor.id, conversation_id)  # another user's id opens an empty conversation
        history = self._memory.get(key)
        services = self._services()
        tenant = self._tenants.por_id(actor.tenant_id)
        canary = f"CTZ-{secrets.token_hex(6)}"
        system = build_system_prompt(
            organisation=tenant.nombre if tenant else "su organización",
            role=actor.rol.value,
            today=self._clock.ahora().date(),
            canary=canary,
        )
        artifacts = TurnArtifacts()
        specs: list[ToolSpec] = self._tools.specs(actor)
        messages = [ChatMessage("system", system)]
        for question, answer in history:
            messages += [ChatMessage("user", question), ChatMessage("assistant", answer)]
        messages.append(ChatMessage("user", message))

        def screen() -> RefusalCategory | None:
            if refusal := screen_user_message(message):
                return refusal
            context = "".join(f"Antes: {q}\nRespuesta: {a[:300]}\n" for q, a in history[-2:])
            quoted = neutralise_delimiters(f"{context}ÚLTIMO MENSAJE: {message}")
            judged = services.chat.complete(
                [
                    ChatMessage("system", SCOPE_INSTRUCTIONS),
                    ChatMessage("user", f"<documento>\n{quoted}\n</documento>"),
                ],
                [],
            )
            return parse_scope_label(judged.content)

        def verify(answer: str) -> AnswerCheck:
            # Figures may come from this turn's tools, from earlier verified answers or from the question itself.
            earlier = " ".join(a for _, a in history)
            evidence = " ".join([*artifacts.evidence, earlier, message, system])
            return check_answer(
                answer, system_prompt=system, canary=canary, evidence=evidence, allowed_links=artifacts.links
            )

        hooks = TurnHooks(
            screen=screen,
            complete=lambda msgs, with_tools: services.chat.complete(msgs, specs if with_tools else []),
            run_tool=lambda call: self._tools.run(actor, call, artifacts),
            verify=verify,
        )
        try:
            result = self._engine.run(messages, hooks)
        except ErrorDeDominio:
            raise
        except Exception as exc:  # noqa: BLE001 - provider failures become a clear error, without their details
            _log.warning("assistant_failed", extra={"tipo": type(exc).__name__})
            raise ServicioNoDisponible("El asistente no respondió. Intente de nuevo.") from exc

        answer = REFUSALS[result.refusal] if result.refusal else result.answer
        if result.refusal is None:
            self._memory.add(key, message, answer)
        self._audit.registrar(
            tenant_id=actor.tenant_id,
            actor=actor.id,
            accion="assistant_message",
            # What was done, never what was written: questions may contain sensitive data.
            detalle=f"{conversation_id}:{result.refusal or 'answered'}:{','.join(artifacts.tools_used)}",
        )
        blocked = result.refusal is not None
        return AssistantReply(
            conversation_id=conversation_id,
            answer=answer,
            refusal=result.refusal.value if result.refusal else None,
            tools_used=tuple(artifacts.tools_used),
            links=() if blocked else tuple(artifacts.links),
            # Reports are rendered by code from stored data, so they stay valid when only the text was rejected.
            reports=tuple(artifacts.reports) if result.refusal in (None, RefusalCategory.UNVERIFIED_FIGURES) else (),
        )
