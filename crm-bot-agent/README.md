# crm-bot-agent

Clon del flujo de onboarding de TalosFlow (referencias en `docs/refs/`).

- `frontend/` Angular 22 (requiere Node >= 22.22), `backend/` NestJS 12 + TypeORM, PostgreSQL 17

## Con Docker (stack completo)

```bash
cp .env.example .env          # rellena POSTGRES_PASSWORD, JWT_SECRET, ANTHROPIC_API_KEY…
docker compose up -d --build  # app en http://localhost:8080 (nginx → /api → backend)
```

Para WhatsApp, `PUBLIC_ORIGIN` debe ser una URL pública con HTTPS: el webhook que se registra en Meta es
`<PUBLIC_ORIGIN>/api/whatsapp/webhook`. Aún no hay migraciones: el backend crea las tablas al arrancar (`DB_SYNC=true`).

## Desarrollo local

```bash
docker compose up -d db                       # solo PostgreSQL, en 127.0.0.1:5433
cd backend && npm i && npm run start:dev      # :3000, config en .env (ver .env.example)
cd frontend && npm i && npx ng serve          # :4200, proxy /api → :3000
```

## Módulos

Dashboard, Conversaciones (en tiempo real), Clientes (tabla/kanban, etiquetas, importar/exportar CSV), Reportes,
Agenda (lista/semana/mes, recordatorios automáticos), Plantillas, **Productos e inventario**, WhatsApp (estado y
credenciales), Agente IA, Conocimiento, Funnel (pasos del agente + automatizaciones) y Webhooks (firmados con HMAC-SHA256).
Todo es multi-tenant por usuario y persiste en PostgreSQL.

- **Inventario:** SKU, costo/margen, stock con movimientos (entrada/salida/ajuste) e historial, stock mínimo con alerta
  (dashboard + webhook `stock.low`). El stock solo cambia por movimientos (transaccionales, sin stock negativo).
  El agente no ofrece lo agotado e informa las unidades disponibles.
- **Tasa BCV:** manual o automática (cada 6 h); los precios se muestran en USD y Bs, y el agente conoce la tasa.
- **Automatizaciones del funnel:** por inactividad, cita creada o cambio de estado → enviar mensaje y/o mover de estado.
- **Recordatorios de citas:** 24 h y 2 h antes por WhatsApp (una sola vez, aunque haya varias instancias).
- **Agente:** restricciones, FAQ, palabras de derivación a humano, horario de atención y mensaje fuera de horario.

## Seguridad

- JWT HS256 fijado, límite de intentos (10/min) en login/registro, contraseñas de 10+ caracteres con letras y números,
  comparación en tiempo constante, `helmet` y cabeceras de seguridad en nginx (CSP).
- Validación estricta de todos los cuerpos (whitelist): no hay asignación masiva de campos (`userId`, `stock`, etc.).
- Todos los datos se filtran por el usuario del token; el tiempo real (Socket.IO) exige JWT y usa una sala por usuario.
- Tokens de WhatsApp cifrados en la BD (AES-256-GCM, `DATA_KEY`). Webhook de Meta con firma `X-Hub-Signature-256`
  obligatoria en producción (`META_APP_SECRET`).
- Webhooks salientes: solo http(s) hacia IPs públicas (anti-SSRF, sin seguir redirects), firmados con HMAC.
- Exportación CSV neutraliza fórmulas (inyección en Excel).
- Pruebas: `cd backend && npm test` (cifrado, SSRF, zonas horarias).

## Pendiente (requiere servicios externos)

- Conexión real de WhatsApp (Meta Embedded Signup): hoy se conecta pegando `phoneNumberId` + token, y los
  mensajes entrantes también se pueden simular desde Conversaciones.
- Respuestas del agente IA con un LLM y búsqueda semántica (embeddings) en Conocimiento: hoy la búsqueda es léxica.
- Sincronización de plantillas con Meta. Mensajes de audio/imagen entrantes (solo texto).
- Equipos con varios usuarios y roles por cuenta (hoy una cuenta = un usuario).
- Migraciones de base de datos (hoy `synchronize`), y los pasos 2-5 del onboarding son una propuesta.
