"""Configuración por variables de entorno (prefijo EVALUADOR_). Nada sensible vive en el repositorio."""

from __future__ import annotations

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Configuracion(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="EVALUADOR_", env_file=".env", extra="ignore")

    entorno: str = "desarrollo"  # desarrollo | produccion
    nivel_de_log: str = "INFO"
    origenes_cors: list[str] = []  # lista explícita; nunca "*" con credenciales
    confiar_en_proxy: bool = False  # solo si Caddy es el único que llega a la API
    limite_login_por_minuto: int = 10
    max_bytes_payload: int = 1_048_576  # 1 MiB para peticiones JSON

    persistencia: str = "memoria"  # memoria (pruebas) | postgres
    clave_cifrado: SecretStr | None = None  # 32 bytes en base64; sin ella no se admiten documentos
    directorio_documentos: str = "/datos/documentos"

    semilla_clave: SecretStr | None = None  # crea el tenant 'demo' con un usuario por rol
    usuario_demo_correo: str | None = None  # cuenta demo adicional (rol cargador); clave solo por entorno
    usuario_demo_clave: SecretStr | None = None
    permitir_semilla_en_produccion: bool = False  # demo del hackatón; retirar cuando exista persistencia SQL

    # --- Motor de IA (todo por entorno: cambiar de modelo no requiere tocar código) ---
    ia_proveedor: str = "openai_compatible"  # openai_compatible | anthropic | (registrados)
    ia_modelo: str = "qwen2.5:7b"  # por defecto un modelo gratuito servido por Ollama
    ia_base_url: str = "http://localhost:11434/v1"
    ia_api_key: SecretStr = SecretStr("")
    embeddings_modelo: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    embeddings_cache: str | None = None
    base_de_datos_url: SecretStr = SecretStr("postgresql://evaluador:evaluador@localhost:5432/evaluador")

    # --- Modo lote (CLI) ---
    lote_paralelo: int = 4  # archivos procesados a la vez (límite configurable; el tiempo es desempate)
    lote_reintentos: int = 2
    lote_repositorio: str | None = None  # ruta del GitLab del evento; si falta, se usa el remoto `origin`
    lote_requerimiento: str = (
        "Dotar un laboratorio de 11 computadoras: 11 equipos completos con gabinete, monitor, teclado, ratón y "
        "protector eléctrico, con instalación, garantía y soporte."
    )

    @property
    def es_produccion(self) -> bool:
        return self.entorno.strip().lower() in {"produccion", "production", "prod"}
