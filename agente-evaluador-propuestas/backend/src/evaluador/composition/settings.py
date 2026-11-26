"""Configuración por variables de entorno (prefijo EVALUADOR_). Nada sensible vive en el repositorio.

Los campos son identificadores en inglés, pero los nombres de las variables de entorno (`EVALUADOR_*`) son un contrato
de operación (el `.env` de producción depende de ellos) y se conservan mediante `validation_alias`.
"""

from __future__ import annotations

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


def _env(name: str) -> str:
    return f"EVALUADOR_{name}"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", populate_by_name=True)

    environment: str = Field("development", validation_alias=_env("ENTORNO"))  # development | production
    log_level: str = Field("INFO", validation_alias=_env("NIVEL_DE_LOG"))
    cors_origins: list[str] = Field([], validation_alias=_env("ORIGENES_CORS"))  # lista explícita; nunca "*"
    trust_proxy: bool = Field(False, validation_alias=_env("CONFIAR_EN_PROXY"))  # solo si Caddy llega a la API
    login_limit_per_minute: int = Field(10, validation_alias=_env("LIMITE_LOGIN_POR_MINUTO"))
    max_bytes_payload: int = Field(1_048_576, validation_alias=_env("MAX_BYTES_PAYLOAD"))  # 1 MiB para JSON

    seed_key: SecretStr | None = Field(None, validation_alias=_env("SEMILLA_CLAVE"))  # tenant 'demo', un usuario/rol
    demo_user_email: str | None = Field(None, validation_alias=_env("USUARIO_DEMO_CORREO"))  # cuenta demo extra
    demo_user_password: SecretStr | None = Field(None, validation_alias=_env("USUARIO_DEMO_CLAVE"))
    allow_seed_in_production: bool = Field(False, validation_alias=_env("PERMITIR_SEMILLA_EN_PRODUCCION"))

    # --- Motor de IA (todo por entorno: cambiar de modelo no requiere tocar código) ---
    ai_provider: str = Field("openai_compatible", validation_alias=_env("IA_PROVEEDOR"))  # | anthropic | ...
    ai_model: str = Field("qwen2.5:7b", validation_alias=_env("IA_MODELO"))  # modelo gratuito servido por Ollama
    ai_base_url: str = Field("http://localhost:11434/v1", validation_alias=_env("IA_BASE_URL"))
    ai_api_key: SecretStr = Field(SecretStr(""), validation_alias=_env("IA_API_KEY"))
    embeddings_model: str = Field(
        "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2", validation_alias=_env("EMBEDDINGS_MODELO")
    )
    embeddings_cache: str | None = Field(None, validation_alias=_env("EMBEDDINGS_CACHE"))
    database_url: SecretStr = Field(
        SecretStr("postgresql://evaluador:evaluador@localhost:5432/evaluador"),
        validation_alias=_env("BASE_DE_DATOS_URL"),
    )

    # --- Modo lote (CLI) ---
    batch_parallel: int = Field(4, validation_alias=_env("LOTE_PARALELO"))  # archivos a la vez; el tiempo desempata
    batch_retries: int = Field(2, validation_alias=_env("LOTE_REINTENTOS"))
    batch_repository: str | None = Field(None, validation_alias=_env("LOTE_REPOSITORIO"))  # GitLab; si falta, `origin`
    batch_requirement: str = Field(
        "Dotar un laboratorio de 11 computadoras: 11 equipos completos con gabinete, monitor, teclado, ratón y "
        "protector eléctrico, con instalación, garantía y soporte.",
        validation_alias=_env("LOTE_REQUERIMIENTO"),
    )

    @property
    def is_production(self) -> bool:
        # Los valores en español se conservan: el `.env` de producción existente usa `produccion`.
        return self.environment.strip().lower() in {"produccion", "production", "prod"}
