# API v1 (compatible con el frontend de Replay-CRM)

Base: `/api` en producción (nginx quita el prefijo) → el backend sirve `/v1/...` y `/auth/...` (sin `/api`).
Auth: `Authorization: Bearer <accessToken>`. Todo es multi-tenant: **tenant = usuario** (`tenant.id == user.id`).
Todos los DTO usan whitelist (campos desconocidos se ignoran) y los ids de ruta deben ser UUID (si no, 400).
Errores: `{statusCode, message: string | string[], error}`.

Los endpoints nativos anteriores (`/contacts`, `/products`, …) siguen funcionando; la UI de Replay solo debe usar `/auth/*` y `/v1/*`.

Convenciones: las ediciones aceptan `PUT` y `PATCH` (parciales: solo se cambian los campos enviados). Los campos no declarados se **descartan** sin error (no hay asignación masiva: `userId`, `id`, `stock`… no se pueden fijar por el cuerpo). Listados con `limit` acotado (el máximo de cada ruta está indicado). Nunca se devuelven secretos (tokens de WhatsApp, claves de IA). Límite global 120 peticiones/min/IP (429).

## Auth

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| POST | `/auth/register` (alias `/auth/signup`) | `{name,email,password,companyName}` (password ≥10, letras+números, ≤72) | Sesión |
| POST | `/auth/login` | `{email,password}` | Sesión |
| GET | `/auth/me` | – | `{id,email,name,companyName,role,tourStatus,tourCompletedAt,needsTour, user, tenant}` (`user`/`tenant` con la misma forma que en la sesión) |

Límite: 10 intentos/min/IP en login y registro (429). Contraseña: ≥10 caracteres, letras y números, ≤72.

Sesión: `{ token, accessToken, user:{id,name,email,role:'owner',companyName,tourStatus,tourCompletedAt,needsTour}, tenant:{id,name,slug,plan:'trial',status:'trial'} }` (`token == accessToken`).

### Tour de bienvenida (Onboarding)

Columnas en `users`: `tourStatus` (`'completed'|'skipped'|null`), `tourCompletedAt` (timestamptz), `tourVersion` (int, 0 por defecto). El servidor define `TOUR_VERSION = 1` (`backend/src/auth/tour.ts`): `needsTour = tourStatus es null || tourVersion < TOUR_VERSION`. Las cuentas existentes quedan en `null` (verán el tour una vez). Subir `TOUR_VERSION` lo vuelve a mostrar a todas.

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| PUT | `/v1/onboarding/tour` | `{status:'completed'\|'skipped'}` | `{tourStatus, tourCompletedAt, needsTour:false}` — guarda estado, fecha y versión actual |
| DELETE | `/v1/onboarding/tour` | – | `{tourStatus:null, tourCompletedAt:null, needsTour:true}` ("Ver tour de nuevo") |

Solo actúa sobre la cuenta del token; cualquier otro campo del cuerpo (p. ej. `userId`) se descarta. `status` inválido o ausente → 400. Es independiente del onboarding de WhatsApp (`/onboarding/*`, entidad `Onboarding`).

## Conversaciones (`id` de conversación == `contactId`; hay una conversación por contacto)

Forma `Conversation`:
```
{ id, contactId, status: 'bot'|'human'|'resolved', lastMessagePreview, lastMessageAt, unreadCount,
  assignedAgentId|null,
  contact: { id,name,phone,email,stage,score,tags[],city,ci,budget,avatarUrl|null } }
```
`status`: `resolved` si se marcó resuelta; `human` si hay intervención pedida (`needsHuman`) o el bot está pausado por un humano; si no `bot`.
`city/ci/budget` salen de los datos capturados por el agente (`data.city|ciudad`, `data.ci|cedula`, `data.budget|presupuesto`).

Forma `Message`:
```
{ id, conversationId, content, sender: 'customer'|'agent'|'bot'|'system', automated: boolean,
  type:'text', direction:'inbound'|'outbound', status:'sent'|'read', createdAt }
```
(`sender`: cliente→customer, persona del equipo→agent, IA→bot; los mensajes automáticos —recordatorios y reglas del funnel— salen como `bot` con `automated:true`.)

| Método | Ruta | Notas |
|---|---|---|
| GET | `/v1/conversations?limit=30&page=1&status=&search=&filter=unread` | `{data:Conversation[], total}`; limit ≤ 100 |
| GET | `/v1/conversations/:id/messages?limit=50&page=1` | `Message[]` ASC; limit ≤ 200; al listar NO marca leído |
| POST | `/v1/conversations/:id/messages` `{text}` | Mensaje de persona del equipo: se envía por WhatsApp, **pausa el bot 30 min**; devuelve `Message` |
| POST | `/v1/conversations/:id/incoming` `{text}` | Simula un mensaje del cliente (mismo camino que el webhook de Meta; el agente responde). Devuelve `{message, reply, warning?}` (Message v1) |
| PUT | `/v1/conversations/:id/resume-bot` | Reanuda la IA → `{success:true, status:'bot'}` |
| PUT | `/v1/conversations/:id/pause-bot` | Pausa la IA (intervención humana) → `{success:true, status:'human'}` |
| PUT | `/v1/conversations/:id/assign` `{agentId: uuid\|null}` | Solo el propio usuario o null → `{success:true}` |
| PUT | `/v1/conversations/:id/read` | Marca leída → `{success:true}` |
| PUT | `/v1/conversations/:id/resolve` `{resolved:boolean}` | → `{success:true, status}` |

## Contactos

Forma `Contact`: `{id,name,phone,email,stage,status,score,source,notes,tags[],needsHuman,city,ci,budget,data,createdAt,updatedAt}` (`stage == status`).
Etapas: `nuevo|contactado|calificado|interesado|negociacion|cerrado|perdido`.

| Método | Ruta | Notas |
|---|---|---|
| GET | `/v1/contacts?stage=&search=&page=1&limit=20` | `{data,total,page,limit}`; limit ≤ 100 |
| GET | `/v1/contacts/pipeline` | `Record<stage, Contact[]>` (siempre las 7 etapas; máx. 2000 contactos) |
| GET | `/v1/contacts/export` | CSV |
| POST | `/v1/contacts/import` `{rows:[{name,phone?,email?}]}` | máx. 5000 → `{imported}` |
| GET | `/v1/contacts/:id` | `Contact` |
| POST | `/v1/contacts` | `{name, phone?, email?, stage?, score?, source?, notes?, tags?, needsHuman?}` → `Contact` |
| PUT/PATCH | `/v1/contacts/:id` | mismos campos, parciales → `Contact` |
| PUT | `/v1/contacts/:id/stage` `{stage}` | → `{success:true, contact}`; dispara reglas y webhooks |
| DELETE | `/v1/contacts/:id` | `{success:true, ok:true}` — borra también sus mensajes; las citas quedan sin contacto |

## Dashboard y reportes

`GET /v1/dashboard/stats?period=7|30|90`:
```
{ aiMessages, humanMessages, newLeads, totalContacts, appointmentsToday, appointmentsWeek,
  automationRate, responseRate, interventions, lowStock,
  pipeline:[{stage,count}], trend:[{date:'YYYY-MM-DD', ai, human, customer}] }
```
(`ai`/`human` = mensajes de IA/equipo por día en el periodo; `customer` = entrantes; un registro por día, con ceros.)

`GET /v1/reports/summary?period=7|30|90` (por defecto 30):
```
{ period, totalContacts, wonContacts, lostContacts, activeConversations, conversionRate,
  stageCounts:{stage:n}, newLeads, qualifiedLeads, qualifiedPct, closedPct, appointmentsCount, appointmentsByAi,
  responseRate, messagesPerLead, peakHour (0-23|null), interventions, aiShare,
  aiResponseTimeAvgSeconds|null, humanResponseTimeAvgMinutes|null, messagesProcessedPeriod,
  funnel:[{stage,name,count}], hours:number[24],
  timeline:{leads:[{date,value}], messages:[{date,value}], appointments:[{date,value}]},
  weeklyActivity:[{day,inbound,outboundAi,human}], sources:[{source,leads,closed}] }
```

## Citas

Forma `Appointment`: `{id,contactId|null,contact:{id,name,phone}|null,service,title,scheduledAt,endsAt|null,status,notes,googleMeetLink,createdBy:'user'|'ai',createdAt}`.
`status` (salida): `scheduled|confirmed|completed|cancelled|no_show`. Entrada acepta esos y también `pending` (=scheduled) y los nuestros (`pendiente|confirmada|completada|cancelada|no_asistio`).

| Método | Ruta | Notas |
|---|---|---|
| GET | `/v1/appointments?startDate=&endDate=&status=` | ISO; máx. 500 |
| GET | `/v1/appointments/:id` | |
| POST | `/v1/appointments` | `{scheduledAt, service?, notes?, googleMeetLink?, endsAt?, contactId? \| contactName?+contactPhone?, status?}` — si hay `contactName` sin `contactId`, busca por teléfono o crea el contacto (`source:'agenda'`). Dispara `appointment.created` (reglas, webhooks, socket `appointment_booked`) |
| PUT/PATCH | `/v1/appointments/:id` | parcial; si cambia `scheduledAt` se reactivan los recordatorios |
| PATCH | `/v1/appointments/:id/status` `{status}` | |
| DELETE | `/v1/appointments/:id` | `{success:true}` |

Recordatorios automáticos por WhatsApp 24 h y 2 h antes (salvo canceladas).

## Productos e inventario

Forma `Product`: `{id,name,description,price,currency,imageUrl,sku,category,isAvailable,active,cost,trackStock,stock,minStock,priceVef|null,bcvRate|null,stockStatus:'ok'|'low'|'out'|'untracked',createdAt,updatedAt}`.

| Método | Ruta | Notas |
|---|---|---|
| GET | `/v1/products` | lista con `priceVef` según la tasa BCV |
| GET | `/v1/products/:id` | |
| POST | `/v1/products` | `{name, price?, cost?, description?, currency?, imageUrl?, sku?, category?, isAvailable?, trackStock?, stock?, minStock?}`; `stock` = stock inicial (queda en el historial); SKU único por cuenta (400 si repite) |
| PUT/PATCH | `/v1/products/:id` | parcial. Si llega `stock` distinto del actual se registra un movimiento `adjust` ("Edición manual") |
| PATCH | `/v1/products/:id/toggle-availability` | invierte `isAvailable` |
| DELETE | `/v1/products/:id` | `{success:true}` |
| POST | `/v1/products/:id/stock` | `{type:'in'\|'out'\|'adjust', quantity, reason?}` → `{product, movement}`; 400 si stock insuficiente |
| GET | `/v1/products/:id/movements` | últimos 100 |
| GET | `/v1/products/inventory/summary` | `{products,tracked,units,costValue,retailValue,outOfStock,lowStock}` |
| GET | `/v1/products/bcv-rate` | `{rate|null, auto, updatedAt|null, currency:'VES/USD'}` |
| POST | `/v1/products/bcv-rate` | `{rate?, auto?}` → igual que GET |
| POST | `/v1/products/bcv-rate/refresh` | consulta la tasa oficial (400 si falla) |

## Plantillas de WhatsApp

Forma: `{id,name,category,language,status:'APPROVED'|'PENDING'|'REJECTED'|'DISABLED',components:[{type,text?}],body,createdAt}`.
`GET/POST /v1/templates`, `GET/PUT/PATCH/DELETE /v1/templates/:id`. POST/PUT: `{name, category?, language?, status?, body? , components?}` (si no hay `body` se toma del componente `BODY`).

## Conocimiento (RAG léxico)

Forma `Chunk`: `{id,sourceFile,chunkIndex,content,createdAt}`.
`GET /v1/knowledge` (máx. 1000) · `POST /v1/knowledge/document {sourceFile?,text}` (máx. 200 000 car.; parte en fragmentos de ~800 car.; `sourceFile` por defecto `'Manual Entry'`) → `Chunk[]` · `GET /v1/knowledge/search?q=&limit=5` (≤20; búsqueda léxica, la misma que usa el agente) → `Chunk[]` · `DELETE /v1/knowledge/chunk/:id` · `DELETE /v1/knowledge/clear` → `{success:true, deleted}`.

## Funnel

Reglas de automatización (`/v1/funnel/rules`):
```
{ id,name, trigger:'inactivity_24h'|'post_appointment'|'stage_changed',
  conditions:{ stage?, waitHours?, toStage?, event? },
  actions:{ moveStage?, sendTemplate?, sendText? },
  isActive, runs, lastRunAt }
```
Equivalencias: `inactivity_24h` = inactividad (`waitHours`, por defecto 24; `stage` filtra por etapa; **no** se limita a 24 h), `post_appointment` = cita creada, `stage_changed` = cambio de etapa (`toStage`). `sendTemplate` = nombre de una plantilla propia (se envía su texto); `sendText` = texto libre (`{{nombre}}`).
`GET/POST /v1/funnel/rules`, `GET/PUT/PATCH/DELETE /v1/funnel/rules/:id`, `PATCH /v1/funnel/rules/:id/toggle`.
Aceptan también `stageFrom`/`stageTo`/`templateName` (como el modal de Replay), `isActive` y `trigger` en cualquiera de las dos nomenclaturas (`inactivity|appointment_created|status_changed`).

Pasos del agente (extra de nuestro producto): `GET/POST /v1/funnel/steps`, `PATCH|PUT|DELETE /v1/funnel/steps/:id`, `GET /v1/funnel/steps/templates`, `POST /v1/funnel/steps/apply-template/:key` — forma `{id,position,name,prompt,objectives,criteria}`.

## Webhooks salientes

Forma: `{id,name,url,secret,events[],isActive,lastDeliveryAt,lastStatus}`.
Eventos: `message.received, message.sent, contact.created, contact.updated, lead.stage_changed, contact.status_changed, appointment.created, appointment.updated, stock.updated, stock.low`.
`GET/POST /v1/webhooks`, `GET/PUT/PATCH/DELETE /v1/webhooks/:id`, `PATCH /v1/webhooks/:id/toggle`, `POST /v1/webhooks/:id/test` → `{status, deliveredAt, targetUrl, payload:{event:'test.ping',timestamp,message}}`, `GET /v1/webhooks/events`.
El **secreto lo genera el servidor** (se ignora el que mande el cliente). URL solo http(s) hacia IP pública (anti-SSRF). Firma `X-Signature: sha256=HMAC(secret, body)` y cabecera `X-Event`.

## Agente IA (`/v1/ai-config`)

```
{ configured, agentName, agentRole, businessName, businessType, language, tone, personality, model, temperature,
  systemPrompt, greeting, salesFlow, restrictions, faq (string 'pregunta: respuesta' por línea), faqItems:[{question,answer}],
  isAiActive, handoffKeywords:string[], handoffMessage, hours:{enabled,days[0-6],start,end}, outOfHoursMessage }
```
`GET` (crea valores por defecto) · `PUT` (parcial; acepta `faq` string o `faqItems`) · `POST /apply-template/:template` (`clinica|restaurante|inmobiliaria|retail`) → config completa + `{success:true, applied}` · `GET /templates` (las 4 plantillas del sistema con `id,icon,title,badge,agentName,agentRole,personality,greeting,salesFlow,restrictions,faq`) · `POST /test {message}` → `{response}` (no guarda nada; 20/min).
`model` es informativo (el modelo real lo define el servidor). `systemPrompt`, `salesFlow`, `restrictions`, `faq`, `agentRole`, `personality`, `language` forman parte del prompt real del agente.

## WhatsApp (`/v1/whatsapp`)

`GET /status` → `{connected, displayPhone, phoneNumber, phoneNumberId|null, wabaId, webhookUrl, verifyToken|null, qualityRating:null}` · `POST /connect {phoneNumberId, accessToken, wabaId?}` (se valida contra Meta; **el token nunca se devuelve**) · `DELETE /connect` · `POST /verify-token/rotate`.
Webhook público de Meta: `GET|POST /whatsapp/webhook` (firma `X-Hub-Signature-256` obligatoria en producción).

## Tiempo real (Socket.IO)

Conectar a `<origen>/ws` (namespace `/ws`, path `/socket.io`; tras nginx: `path:'/api/socket.io'`) con `auth:{token}`; sin token válido se desconecta. Cada usuario entra solo a su sala.
Servidor → cliente:

| Evento | Payload |
|---|---|
| `new_message` | `{conversationId, message: Message}` (entrantes, respuestas de IA, de equipo y automáticos) |
| `conversation_updated` | `{conversationId, status, unreadCount?}` (`unreadCount` solo cuando lo emiten read/resume/pause/resolve/assign/mensaje de equipo) |
| `human_intervention` | `{conversationId, contactId, reason}` (el agente derivó, o saltó una palabra de derivación) |
| `agent_resumed` | `{conversationId}` |
| `contact_stage_changed` | `{contactId, from, to, stage, contact: Contact}` |
| `appointment_booked` | `{appointment: Appointment}` |
| `stock_alert` | `{product}` (stock bajo) |
| `crm` | `{event, data}` (evento genérico del CRM, formato nativo) |

Cliente → servidor: `join_conversation {conversationId}` / `leave_conversation` / `typing {conversationId,isTyping}` (se reenvía como `typing {userId,isTyping}` a los demás sockets del mismo usuario en esa conversación).
El namespace raíz `/` (path `/socket.io`) sigue emitiendo solo `crm` (compatibilidad con el frontend anterior).
