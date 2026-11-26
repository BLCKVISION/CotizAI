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

Login de desarrollo: solo **correo y contraseña**. Usuarios `<rol>@demo.local` (`cargador`, `evaluador`, `aprobador`, `auditor`) con la clave de `EVALUADOR_SEMILLA_CLAVE`, y una cuenta extra opcional con `EVALUADOR_USUARIO_DEMO_CORREO` / `EVALUADOR_USUARIO_DEMO_CLAVE`.

## Modelos de IA

Por defecto usa **Ollama** (gratis, local): `ollama pull qwen2.5:7b`. Para cambiar de modelo o proveedor edite `EVALUADOR_IA_*` en `.env`; no hay que tocar código. Los embeddings son locales y gratuitos (`fastembed`, multilingüe).
