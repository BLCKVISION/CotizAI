# CotizAI — Agente Evaluador de Propuestas de Servicios

Hackatón Venezuela INNOVA 2026 · Reto grupal (IA, Desarrollo de Software y Ciberseguridad).

## Participantes

| Nombre completo | Rol |
|---|---|
| Emanuel [COMPLETAR APELLIDO] | [COMPLETAR ROL] |
| Albert [COMPLETAR APELLIDO] | [COMPLETAR ROL] |
| Deivy [COMPLETAR APELLIDO] | [COMPLETAR ROL] |
| Nikolas [COMPLETAR APELLIDO] | [COMPLETAR ROL] |
| [COMPLETAR NOMBRE] | [COMPLETAR ROL] |

## Descripción del proyecto

Comparar a mano las ofertas de varios proveedores es lento y deja pasar fletes ocultos, errores de cálculo y
condiciones desfavorables. CotizAI recibe el requerimiento de un proyecto y las propuestas en PDF (digital o
escaneado), foto o XLSX; la IA transcribe cada documento y **el código decide** con reglas sobre esa transcripción:
descarta con cita textual, calcula el costo real paso a paso, convierte monedas con una tasa trazable y ordena las
válidas. La decisión final es del comité.

- Arquitectura y decisiones: [`docs/SYSTEM_DESIGN.md`](docs/SYSTEM_DESIGN.md)
- Estándares de código y revisión: [`docs/ESTANDARES.md`](docs/ESTANDARES.md)
- Plan de trabajo original: [`docs/arquitectura.pdf`](docs/arquitectura.pdf)
- Sistema de diseño: [`design-system/agente-evaluador/MASTER.md`](design-system/agente-evaluador/MASTER.md)

| Carpeta | Contenido |
|---|---|
| `backend/` | FastAPI · arquitectura hexagonal · motor LangGraph · RAG |
| `frontend/` | Expo (React Native): web, iOS y Android |
| `infra/` | Docker Compose, nginx y SQL de inicio |
| `muestras/` | Datos ficticios y resultado esperado para calibrar las reglas |

## Alcance

**Implementado**

- Proyectos con estados, usuarios con cuatro roles, directorio de proveedores y auditoría con huellas encadenadas.
- Carga de hasta 20 propuestas por proyecto, cifradas con AES-256-GCM. En la plataforma se analizan por tandas de 1 a 5
  (los resultados se acumulan y se ordenan juntos); el modo lote procesa todos los archivos.
- Lectura de PDF, PDF escaneado, imágenes y XLSX (incluye contenido oculto).
- Reglas de descarte: alcance, compatibilidad, capacidad, calidad, costos abusivos, aritmética y manipulación.
- Costo real paso a paso, tasa del BCV o manual, ranking, antecedentes de descarte del proveedor.
- Informe en Markdown y CSV, preguntas sobre un proyecto evaluado con citas, y modo lote que genera `salida.json`.
- Búsqueda web de precios de mercado, **desactivada por defecto** (`EVALUADOR_MARKET_SEARCH_ENABLED=true`).

**Limitaciones**

- No hay exportación a PDF del informe.
- La interfaz muestra el tiempo transcurrido de la evaluación, no la traza paso a paso del agente.
- El cifrado en reposo de la aplicación cubre los documentos originales, no la base de datos ni la auditoría.
- Sin PostgreSQL, los datos se pierden al reiniciar la API. El índice de preguntas está siempre en memoria: tras un
  reinicio hay que volver a evaluar.

## Requerimientos del sistema

- Python 3.12 o superior (la imagen Docker usa 3.12). Node.js 20 o superior y npm para el frontend.
- OCR de imágenes y páginas escaneadas: Tesseract con español (`sudo apt install tesseract-ocr tesseract-ocr-spa`); la imagen Docker ya lo incluye. Sin él, esas lecturas usan el modelo con visión.
- Opcional: Docker con Compose, y PostgreSQL 16 con `pgvector`.
- Un modelo con visión: una API compatible con OpenAI (OpenRouter, Ollama, vLLM) o Anthropic.
- Acceso a internet para el modelo, la tasa del BCV y la primera descarga del modelo de *embeddings*.
- Variables de entorno: ver [`backend/.env.example`](backend/.env.example) e
  [`infra/.env.example`](infra/.env.example). Las claves van solo en `.env`, que no se versiona.

## Instalación y despliegue

1. Clonar: `git clone https://gitlab.nube.gob.ve/blckvisions/cotizai.git && cd cotizai`
2. Instalar dependencias:

   ```bash
   cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
   cd ../frontend && npm ci
   ```

3. Configurar: `cp backend/.env.example backend/.env` y completar. Para evaluar con OpenRouter:

   ```ini
   EVALUADOR_IA_PROVEEDOR=openai_compatible
   EVALUADOR_IA_BASE_URL=https://openrouter.ai/api/v1
   EVALUADOR_IA_MODELO=google/gemini-2.5-flash-lite
   EVALUADOR_IA_API_KEY=su-clave
   EVALUADOR_ORIGENES_CORS='["http://localhost:8081"]'
   EVALUADOR_CLAVE_CIFRADO=       # genere una con: openssl rand -base64 32
   EVALUADOR_SEMILLA_CLAVE=       # clave de los usuarios de demostración
   EVALUADOR_DIRECTORIO_DOCUMENTOS=/ruta/fuera/del/repositorio
   ```

4. Ejecutar, en dos terminales:

   ```bash
   cd backend && .venv/bin/uvicorn evaluador.adapters.inbound.http.main:app --app-dir src --port 8000
   cd frontend && npx expo start --web
   ```

Usuarios de desarrollo: `<rol>@demo.local` (`cargador`, `evaluador`, `aprobador`, `auditor`) con la clave de
`EVALUADOR_SEMILLA_CLAVE`.

Despliegue en servidor (nginx del host, API y base de datos): `cp infra/.env.example infra/.env`, completarlo y
ejecutar `./infra/deploy.sh todo`.

### Modo lote (`salida.json`)

Haga commit antes: `salida.json` registra el commit actual.

```bash
cd backend
PYTHONPATH=src .venv/bin/python -m evaluador.lote --lote RUTA/lote/propuestas \
  --requerimiento-archivo RUTA/lote/proyecto.pdf --salida ../salida.json --paralelo 1 \
  --repositorio blckvisions/cotizai
```

### Verificación

```bash
cd backend && .venv/bin/pytest && .venv/bin/ruff check src tests scripts && .venv/bin/python scripts/calibrate_samples.py
cd frontend && npm run typecheck && npm run lint && bash tests/run.sh
```

## Recursos, librerías y APIs declarados

Las versiones exactas están en [`backend/requirements.txt`](backend/requirements.txt) y
[`frontend/package-lock.json`](frontend/package-lock.json).

**Backend (Python)**

- API y validación: FastAPI, Uvicorn, Pydantic, pydantic-settings, HTTPX.
- Agente y RAG: LangGraph, FastEmbed, NumPy, pgvector.
- Datos: Psycopg, SQLAlchemy, Alembic.
- Documentos: pdfplumber, pypdfium2 y Pillow (instalados con pdfplumber), openpyxl, defusedxml.
- Seguridad: argon2-cffi, cryptography, PyJWT.
- Calidad: pytest, pytest-asyncio, Ruff, mypy.

**Frontend**

- Expo (Router, Metro Runtime, Constants, Font, Linking, Secure Store, Status Bar), React, React DOM, React Native,
  React Native Web, react-native-safe-area-context, react-native-screens.
- Calidad: TypeScript, ESLint, eslint-config-expo.
- El proyecto partió de la plantilla de Expo (licencia MIT, ver [`frontend/LICENSE`](frontend/LICENSE)).

**Recursos gráficos**

- Tipografía Urbanist (Google Fonts, SIL OFL), mediante `@expo-google-fonts/urbanist`. También figuran como
  dependencias los paquetes de Inter, Playfair Display y Atkinson Hyperlegible.
- Íconos Feather (MIT), mediante `@expo/vector-icons`.
- Íconos Solar, estilo *outline*, de 480 Design (CC BY 4.0): originales en `Icons/`, convertidos en
  `frontend/src/design/icons/paths.ts`.
- *Favicon*, isotipo y logotipo de CotizAI: propios del equipo (originales en `img/`).
- Íconos de aplicación móvil en `frontend/assets/`: los de la plantilla de Expo.
- Logotipo, isotipo e imagen de acceso (`img/`, `frontend/assets/brand/`): [COMPLETAR ORIGEN, AUTOR Y LICENCIA].

**Modelos, APIs y servicios externos**

- OpenRouter: `google/gemini-2.5-flash-lite` (texto y visión) y, si se activa la búsqueda de precios,
  `perplexity/sonar`.
- Compatible también con Anthropic y con Ollama (modelo por defecto: `qwen2.5:7b`).
- *Embeddings* locales: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`.
- Banco Central de Venezuela (`https://www.bcv.org.ve/`) para la tasa oficial.
- Certificado intermedio público de Sectigo (`sectigo_ov_r36.pem`): completa la cadena TLS del sitio del BCV sin
  desactivar la verificación.

**Infraestructura**

- PostgreSQL 16 con pgvector (`pgvector/pgvector:pg16`), imágenes `python:3.12-slim`, `node:20-alpine` y
  `caddy:2-alpine`, Docker Compose, nginx y Certbot.

**Asistentes de inteligencia artificial usados en el desarrollo**

- Claude Code (modelos Claude de Anthropic): código, pruebas y documentación.
- [COMPLETAR: otras herramientas de IA, *plugins* o generadores de diseño que haya usado el equipo.]

## Flujo guiado

Cada proyecto avanza en 5 pasos: **datos → propuestas → análisis de la IA → verificación de una persona → resultado**. En la
verificación, cada propuesta muestra la misma plantilla (por qué sí o por qué no, siete preguntas de control, citas y
costo paso a paso) y la persona responde sí o no; si contradice a la IA debe justificarlo. Después se pueden agregar
propuestas y volver a evaluar solo las elegidas. El rol `coordinador` recorre todo el flujo; adjudicar sigue siendo del
aprobador.

