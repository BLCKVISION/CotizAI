# Estándares de código, revisión y buenas prácticas

Aplican a **backend (Python)** y **frontend (TypeScript / React Native)**. Lo que una herramienta puede verificar, se verifica en CI; esto documenta el resto.

## 1. Principios comunes

1. **Legibilidad > ingenio.** Nombres claros, funciones cortas, una responsabilidad.
2. **Dependencias hacia adentro.** El dominio no importa frameworks ni infraestructura.
3. **Validar en el borde, confiar adentro.** DTOs estrictos en la entrada; el dominio asume datos válidos.
4. **Inmutabilidad por defecto.** Devolver copias nuevas; no mutar argumentos.
5. **Fallar de forma explícita.** Sin `except: pass`, sin valores por defecto que oculten errores.
6. **Seguridad por defecto:** mínimo privilegio, sin secretos en el repositorio, entradas externas = no confiables.
7. **Idioma:** el **código del backend y la API van en inglés** (identificadores, módulos, rutas, campos JSON, valores de enums, tests, commits); la **interfaz, los mensajes para la persona usuaria y la documentación van en español**. Excepciones fijadas por el enunciado: claves de `salida.json` y códigos de descarte (`ALCANCE`, `COMPAT`…). Un mismo concepto, un mismo nombre en todo el sistema. Detalle y tabla en [`SYSTEM_DESIGN.md`](SYSTEM_DESIGN.md#convención-de-idioma-obligatoria). Regla para personas y agentes: [`AGENTS.md`](../AGENTS.md).

## 2. Backend (Python 3.12)

### Arquitectura
- Capas: `domain` → `application` (puertos + casos de uso) → `adapters` → `composition`. **Prohibido** importar `adapters` o `fastapi`/`sqlalchemy` desde `domain` o `application`.
- Cada dependencia externa (BD, modelo, reloj, ids, archivos) es un **puerto** (`typing.Protocol`) con adaptador en `adapters/outbound`.
- Casos de uso: una clase = una acción, dependencias por constructor, método `execute` (el código existente usa `ejecutar`). **Autorización y tenant se aplican en el caso de uso**, no solo en HTTP.
- Solo `composition/` instancia adaptadores concretos. Sin singletons globales ni service locator.
- Entidades `@dataclass(frozen=True, slots=True)`; cambios devuelven una nueva instancia.

### Estilo y tipos
- `ruff` (lint + formato, línea 120) y `mypy --strict` deben pasar. Type hints en toda firma pública.
- `Decimal` para dinero. **Nunca** `float`. Los montos viajan como texto (literal + valor).
- Fechas con zona (UTC internamente, ISO 8601 en el borde). El reloj se inyecta (`Reloj`); no llamar `datetime.now()` en dominio.
- Excepciones de dominio propias (`domain/errores.py`); los adaptadores las traducen. Nunca capturar `Exception` salvo en un borde que registre y traduzca (marcado con `# noqa: BLE001` y comentario del motivo).
- Sin `print`; usar `logging`.

### API HTTP
- Prefijo `/api/v1`, recursos en **plural**, sin verbos en la ruta (`POST /sessions`, no `/login`). Acciones de estado como sub-recurso (`/projects/{id}/transitions`). Rutas en **inglés**.
- **DTO de entrada** por endpoint: `extra="forbid"`, longitudes y patrones acotados, `SecretStr` para secretos. Nunca recibir dicts ni modelos de dominio.
- **DTO de salida** explícito; no exponer entidades (ni hashes, ni ids internos de otros tenants).
- Autenticación y autorización por **guards** (`Depends`); trazabilidad y cabeceras por **interceptores**.
- Códigos: 201 creación, 204 sin cuerpo, 401 sin sesión, 403 sin permiso, 404 (también otro tenant), 409 conflicto de estado, 422 payload inválido, 429 límite.
- Errores siempre `{codigo, mensaje, track_id}`; **nunca** devolver el valor recibido ni trazas.

### Seguridad
- Contraseñas: Argon2id. Tokens: opacos, solo se guarda su huella. Comparaciones sensibles en tiempo constante.
- Mensaje único para fallos de login. Sin enumeración de usuarios ni de tenants. El login es solo correo + contraseña; el tenant se deduce en el servidor (correo único global).
- **Todo acceso a datos recibe `tenant_id`** y lo filtra. Una consulta sin tenant es un bug de seguridad.
- Documentos y propuestas = **no confiables**: no se interpretan como instrucciones; el modelo no recibe herramientas.
- Secretos solo por entorno (`EVALUADOR_*`), nunca en código, logs ni imágenes. `.env` fuera de git.

### Logs
- JSON, una línea por evento, con `trackId`, `ip`, `sesionId`, `tenantId`, `usuarioId` (automático por contexto).
- Todo dato pasa por `censurar()`. Nunca loguear contraseñas, tokens, cabeceras `Authorization`/`Cookie`, RIF ni documentos completos.
- Excepciones: registrar el **tipo**, no el mensaje con datos.

### IA / RAG
- La decisión es **código**; el modelo extrae y juzga lo cualitativo con evidencia citada.
- Salida del modelo validada con Pydantic; error de lectura → una relectura → `pendiente_de_revision` (nunca descarta).
- Un nodo = una responsabilidad; depende de puertos. Flujo en `grafo.py`.
- El modelo se elige por configuración; nuevas integraciones se **registran** en la fábrica.
- Consultas vectoriales siempre con `tenant_id`.

### Pruebas
- Pirámide: dominio (puro, sin mocks) → casos de uso (con fakes de puertos) → adaptadores (integración real: Postgres/pgvector) → E2E de flujos críticos.
- **TDD** para reglas de dominio y casos de uso; cobertura ≥ **80 %** (dominio y aplicación ≥ 90 %).
- Cada bug corregido añade una prueba que lo reproduce. Pruebas sin red ni reloj real.
- Obligatorias: aislamiento entre tenants, sin enumeración en login, censura de logs, y un caso por cada causa de descarte.

## 3. Frontend (React Native + Expo + TypeScript)

### Estructura
`app/` (rutas Expo Router, finas) → `features/<dominio>/` (pantallas, hooks, servicios) → `core/` (cliente API, sesión, config) → `design/` (tokens + componentes base). Una feature no importa de otra; comparten por `core/` o `design/`.

### Código
- TypeScript **estricto** (`strict: true`, sin `any`; `unknown` + validación en el borde). ESLint + Prettier sin avisos.
- Componentes funcionales y pequeños; la lógica de datos va en **hooks**, no en el JSX. Props tipadas.
- Estado de servidor separado del estado de UI. Sin estado global innecesario.
- Sin valores crudos: colores, espaciado y tipografía salen de **tokens** (`design/tokens.ts`). Sin hex ni px sueltos en componentes.
- Una única capa de API (`core/api`) que añade `Authorization` y `X-Track-Id`, tipa respuestas y traduce errores.

### UX y accesibilidad (skill `ui-ux-pro-max`, sistema en `design-system/`)
- Contraste ≥ **4.5:1**; objetivos táctiles ≥ **44×44**; texto base ≥ 16; foco visible; respetar *reduce motion*.
- `accessibilityRole`, `accessibilityLabel` y `accessibilityState` en todo control; botones de solo icono llevan etiqueta.
- Formularios: etiqueta **visible** (no solo placeholder), error junto al campo, estado de carga y deshabilitado al enviar, teclado correcto (`keyboardType`, `autoComplete`, `textContentType`).
- Iconos vectoriales (nunca emojis como iconos). Diseño **mobile-first**, probado en 375, 768, 1024 y 1440 px, y con safe areas.
- Estados siempre cubiertos: cargando, vacío, error, sin permiso.

### Seguridad
- Token en `expo-secure-store` (móvil) y **solo memoria** en web; **nunca** `localStorage`/`AsyncStorage`.
- No loguear tokens ni contraseñas; no incluir secretos en el bundle (todo lo `EXPO_PUBLIC_*` es público).
- Mostrar al usuario el `trackId` de los errores para soporte; no mostrar mensajes técnicos.
- La UI **no decide permisos**: oculta lo no permitido por UX, pero la autoridad es el backend.

### Pruebas
- Jest + React Native Testing Library para hooks y componentes; consultas por rol/etiqueta (accesibilidad), no por `testID` salvo necesidad.
- E2E (Playwright en web) de login y flujo de proyecto.

## 4. Git y revisión

- **Ramas cortas** por tarea: `feat/…`, `fix/…`, `chore/…`. Integrar a `main` al menos cada 2–3 horas. `main` siempre compila y pasa pruebas.
- **Commits pequeños** con Conventional Commits: `feat(auth): …`, `fix(rag): …`, `test:`, `docs:`, `refactor:`, `chore:`. Imperativo, ≤ 72 caracteres en el asunto.
- **Nunca** subir: claves, certificados, `.env`, propuestas reales, contenido descifrado.
- Cambiar un contrato (`extraccion.py`, DTOs, API) exige avisar a quienes lo consumen **en el mismo PR**.

### Definición de «terminado»
Cumple su criterio · integrado en `main` · con commit · **otra persona lo probó** · pruebas y linters en verde · documentación actualizada si cambió un contrato.

### Checklist de PR (autor)
- [ ] Pruebas nuevas/ajustadas; CI en verde (`ruff`, `mypy`, `pytest` / `tsc`, `eslint`, `jest`)
- [ ] Sin secretos, sin datos reales, sin `print`/`console.log`
- [ ] Contratos y docs actualizados (`SYSTEM_DESIGN.md` si cambia la arquitectura)
- [ ] Captura o descripción del cambio visible (frontend)

### Checklist de revisión (revisor)
1. **Correctitud:** ¿hace lo pedido? ¿casos borde (vacío, nulo, límites)?
2. **Arquitectura:** ¿respeta la dirección de dependencias? ¿lógica de negocio fuera de adaptadores/UI?
3. **Seguridad:** ¿tenant filtrado? ¿permiso comprobado? ¿entrada validada? ¿algo sensible en logs/respuestas?
4. **Pruebas:** ¿cubren el comportamiento y no la implementación? ¿falla la prueba sin el cambio?
5. **Legibilidad y SOLID:** nombres, tamaño, duplicación, responsabilidades.
6. **UX/accesibilidad** (frontend): contraste, foco, etiquetas, estados vacío/error/carga.
7. **Operación:** ¿logs útiles y seguros? ¿configuración por entorno?
- Tono: comentarios sobre el código, no la persona; distinguir **bloqueante** de *sugerencia*. Responder en < 2 h durante el hackatón.

## 5. Automatización (CI local y remota)

```bash
# Backend
ruff check . && ruff format --check . && mypy src && pytest --cov=src --cov-fail-under=80
# Frontend
npx tsc --noEmit && npx eslint . && npx jest
# Imágenes
docker compose -f infra/compose.yml config -q
```
Los hooks de `pre-commit` ejecutan formato y lint; el CI repite todo y bloquea el merge si falla.
