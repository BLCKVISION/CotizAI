# Agente Evaluador de Propuestas

Hackatón Venezuela INNOVA 2026 · Reto C. Evalúa propuestas para dotar un laboratorio de 11 computadoras, explica cada decisión y gestiona la revisión del comité.

- 📐 Arquitectura y decisiones: [`docs/SYSTEM_DESIGN.md`](docs/SYSTEM_DESIGN.md)
- ✅ Estándares de código, revisión y buenas prácticas: [`docs/ESTANDARES.md`](docs/ESTANDARES.md)
- 📄 Plan de trabajo original: [`docs/arquitectura.pdf`](docs/arquitectura.pdf)
- 🎨 Sistema de diseño: [`design-system/agente-evaluador/MASTER.md`](design-system/agente-evaluador/MASTER.md)

## Estructura

| Carpeta | Contenido |
|---|---|
| `backend/` | FastAPI · arquitectura hexagonal · motor LangGraph · RAG con pgvector |
| `frontend/` | Expo (React Native): web + iOS + Android |
| `infra/` | Docker Compose de la pila completa, SQL de inicio |
| `muestras/` | Datos ficticios y resultado esperado |

## Arranque rápido

```bash
# Servidor (nginx del host + api + db): hackathon.exmachina.systems / cotiz-ai.exmachina.systems / api-hackathon.exmachina.systems
cp infra/.env.example infra/.env     # edite POSTGRES_PASSWORD
./infra/deploy.sh todo               # o por partes: nginx | frontend | api | tls

# Backend aislado (con recarga) — crea el tenant "demo" si define EVALUADOR_SEMILLA_CLAVE
cd backend && cp .env.example .env && docker compose up --build
# o sin Docker:
python -m venv .venv && .venv/bin/pip install -r requirements-dev.txt && .venv/bin/pytest

# Frontend aislado
cd frontend && npm ci && npx expo start        # w = web, a = Android, i = iOS
```

Login de desarrollo: solo **correo y contraseña**. Usuarios `<role>@demo.local` (`loader`, `evaluator`, `approver`, `auditor`) con la clave de `EVALUADOR_SEMILLA_CLAVE`, y una cuenta extra opcional con `EVALUADOR_USUARIO_DEMO_CORREO` / `EVALUADOR_USUARIO_DEMO_CLAVE`.

## Modelos de IA

Por defecto usa **Ollama** (gratis, local): `ollama pull qwen2.5:7b`. Para cambiar de modelo o proveedor edite `EVALUADOR_IA_*` en `.env`; no hay que tocar código. Los embeddings son locales y gratuitos (`fastembed`, multilingüe).

## Transcripción de presupuestos (imagen → Markdown)

`POST /api/v1/transcriptions?archivo=<nombre.png|jpg|jpeg|webp>` (permiso de carga, cuerpo binario crudo, hasta 25 MiB) devuelve:

```json
{ "markdown": "...", "uncertain": ["1.1?0,00"], "quality": "high|medium|low", "notices": ["..."] }
```

- Lee fotos o capturas, también algo borrosas: mejora la imagen (orientación, escala, contraste, nitidez) y, si la primera lectura es dudosa, hace una segunda sobre la original. Las cifras que difieren entre lecturas se marcan en `uncertain`; **nunca se adivina un valor ilegible**.
- `quality: low` o `notices` con «requiere revisión humana» indican que hay que revisar a mano.
- Requiere un modelo **con visión** (`EVALUADOR_IA_*`). El `qwen2.5:7b` por defecto de Ollama no lee imágenes: con un modelo sin visión (o sin proveedor) el endpoint responde `503 service_unavailable` indicando que se revise el modelo configurado, y el operador ve el tipo de fallo en el log (`transcription_provider_failed`).
- En el frontend: menú **Transcribir** (sube la imagen, muestra las tablas y resalta las cifras inciertas).
