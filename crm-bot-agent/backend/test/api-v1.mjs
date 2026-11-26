// Prueba de API de /v1 contra un backend en marcha (no usa mocks de Nest).
//   API=http://localhost:3100 DB_NAME=crm_bot_v1 OUT=<dir con wa-sent.log/hooks.log de los fakes> node test/api-v1.mjs
// Requiere: Postgres accesible (DB_*), y para webhooks/WhatsApp los servidores simulados (ver README) con ALLOW_PRIVATE_WEBHOOKS=true.
import { createRequire } from 'module';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const req = createRequire(path.join(here, '../node_modules/'));
const pg = req('pg');
const { io } = (() => { for (const p of [path.join(here, '../node_modules/'), path.join(here, '../../frontend/node_modules/')]) { try { return createRequire(p)('socket.io-client'); } catch {} } throw new Error('socket.io-client no encontrado'); })();
const API = process.env.API ?? 'http://localhost:3100';
const db = new pg.Client({ host: process.env.DB_HOST ?? 'localhost', port: +(process.env.DB_PORT ?? 5433), user: process.env.DB_USER ?? 'crm', password: process.env.DB_PASS ?? 'crm_dev', database: process.env.DB_NAME ?? 'crm_bot_v1' });
await db.connect();

let pass = 0, fail = 0;
const ok = (c, name, extra = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'} ${name}${c ? '' : '  → ' + String(extra).slice(0, 300)}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const call = async (t, m, p, b, h = {}) => {
  const r = await fetch(API + p, { method: m, headers: { 'content-type': 'application/json', ...(t ? { authorization: 'Bearer ' + t } : {}), ...h }, body: b === undefined ? undefined : JSON.stringify(b) });
  const x = await r.text(); let j; try { j = JSON.parse(x); } catch { j = x; } return { s: r.status, j };
};
const uniq = Date.now();
const register = async tag => call(null, 'POST', '/auth/register', { name: 'Tester ' + tag, email: `${tag}${uniq}@v1.test`, password: 'Clave-segura-123', companyName: 'Empresa ' + tag });
const isoIn = ms => new Date(Date.now() + ms).toISOString();
const keys = (o, ks) => ks.every(k => k in o);

// ── Auth + tour ─────────────────────────────────────────────────────────────
let r = await register('a');
ok(r.s === 201 && r.j.token && r.j.accessToken === r.j.token, 'register devuelve token y accessToken', JSON.stringify(r.j));
ok(r.j.user?.role === 'owner' && r.j.user.name === 'Tester a' && r.j.tenant?.id === r.j.user.id && r.j.tenant.plan === 'trial' && r.j.tenant.name === 'Empresa a' && !!r.j.tenant.slug, 'register: user{role,name} y tenant{id,name,slug,plan,status}', JSON.stringify(r.j));
ok(r.j.user.tourStatus === null && r.j.user.tourCompletedAt === null && r.j.user.needsTour === true, 'tour: por defecto null y needsTour=true', JSON.stringify(r.j.user));
const A = r.j.accessToken, aId = r.j.user.id;
const B = (await register('b')).j.accessToken;
r = await call(null, 'POST', '/auth/login', { email: `a${uniq}@v1.test`, password: 'Clave-segura-123' });
ok(r.s === 200 && r.j.accessToken && r.j.user.needsTour === true && r.j.tenant.id === aId, 'login incluye accessToken, user.needsTour y tenant');
r = await call(A, 'GET', '/auth/me'); ok(r.s === 200 && r.j.user?.email === `a${uniq}@v1.test` && r.j.tenant && r.j.needsTour === true && r.j.email, 'GET /auth/me: user, tenant y needsTour', JSON.stringify(r.j));
r = await call(A, 'PUT', '/v1/onboarding/tour', { status: 'skipped' }); ok(r.s === 200 && r.j.tourStatus === 'skipped' && r.j.needsTour === false && r.j.tourCompletedAt, 'tour: omitir', JSON.stringify(r.j));
r = await call(A, 'PUT', '/v1/onboarding/tour', { status: 'completed' }); ok(r.j.tourStatus === 'completed' && r.j.needsTour === false, 'tour: completar');
r = await call(A, 'GET', '/auth/me'); ok(r.j.user.tourStatus === 'completed' && r.j.user.needsTour === false, 'tour: /auth/me refleja el estado');
r = await call(B, 'GET', '/auth/me'); ok(r.j.user.tourStatus === null && r.j.user.needsTour === true, 'tour: aislado por usuario (B sigue sin verlo)');
r = await call(A, 'PUT', '/v1/onboarding/tour', { status: 'otro' }); ok(r.s === 400, 'tour: estado inválido → 400', r.s);
const bUser = (await call(B, 'GET', '/auth/me')).j.id;
r = await call(A, 'PUT', '/v1/onboarding/tour', { status: 'completed', userId: bUser, tourStatus: 'completed' }); ok(r.s === 200 && (await call(B, 'GET', '/auth/me')).j.user.needsTour === true, 'tour: campos extra (userId) se descartan; no se puede tocar el tour de otro usuario');
r = await call(A, 'PUT', '/v1/onboarding/tour', {}); ok(r.s === 400, 'tour: cuerpo vacío → 400');
r = await call(null, 'PUT', '/v1/onboarding/tour', { status: 'completed' }); ok(r.s === 401, 'tour: requiere JWT');
await db.query(`UPDATE users SET "tourVersion" = 0 WHERE id = $1`, [aId]); r = await call(A, 'GET', '/auth/me'); ok(r.j.user.needsTour === true, 'tour: versión antigua vuelve a mostrarse');
r = await call(A, 'DELETE', '/v1/onboarding/tour'); ok(r.s === 200 && r.j.tourStatus === null && r.j.tourCompletedAt === null && r.j.needsTour === true, 'tour: reinicio', JSON.stringify(r.j));
r = await call(null, 'POST', '/auth/register', { name: 'x', email: 'bad', password: 'corta', companyName: 'y' }); ok(r.s === 400, 'register valida datos');
const noAuth = await Promise.all(['/v1/contacts', '/v1/conversations', '/v1/appointments', '/v1/products', '/v1/templates', '/v1/knowledge', '/v1/funnel/rules', '/v1/webhooks', '/v1/ai-config', '/v1/dashboard/stats', '/v1/reports/summary', '/v1/whatsapp/status'].map(p => call(null, 'GET', p)));
ok(noAuth.every(x => x.s === 401), 'todos los /v1 exigen JWT', noAuth.map(x => x.s).join());

// ── Contactos ───────────────────────────────────────────────────────────────
r = await call(A, 'POST', '/v1/contacts', { name: 'Ana Pérez', phone: '+34600000001', email: 'ana@x.com', stage: 'interesado', userId: aId, tags: ['vip'], id: '11111111-1111-1111-1111-111111111111', needsHuman: false, evil: 1 });
ok(r.s === 201 && keys(r.j, ['id', 'name', 'phone', 'email', 'stage', 'score', 'tags', 'city', 'ci', 'budget']) && r.j.stage === 'interesado' && r.j.status === 'interesado' && r.j.id !== '11111111-1111-1111-1111-111111111111' && !('evil' in r.j), 'contacto: forma Replay y sin asignación masiva', JSON.stringify(r.j));
const ana = r.j;
const pedro = (await call(A, 'POST', '/v1/contacts', { name: 'Pedro Gil', phone: '+34600000002' })).j;
r = await call(A, 'POST', '/v1/contacts', { name: '', stage: 'xx' }); ok(r.s === 400, 'contacto inválido → 400');
r = await call(A, 'GET', '/v1/contacts?limit=1'); ok(r.s === 200 && Array.isArray(r.j.data) && r.j.data.length === 1 && r.j.total === 2 && r.j.limit === 1 && r.j.page === 1, 'lista paginada {data,total,page,limit}', JSON.stringify(r.j).slice(0, 200));
r = await call(A, 'GET', '/v1/contacts?limit=9999'); ok(r.j.limit === 100, 'limit acotado a 100');
r = await call(A, 'GET', '/v1/contacts?search=ana'); ok(r.j.data.length === 1 && r.j.data[0].id === ana.id, 'búsqueda por texto');
r = await call(A, 'GET', '/v1/contacts?search=%25'); ok(r.j.data.length === 0, 'búsqueda escapa comodines LIKE', r.j.data.length);
r = await call(A, 'GET', '/v1/contacts?stage=interesado'); ok(r.j.data.length === 1 && r.j.data[0].id === ana.id, 'filtro por etapa');
r = await call(A, 'GET', '/v1/contacts?stage=zzz'); ok(r.s === 400, 'etapa inválida → 400');
r = await call(A, 'GET', '/v1/contacts/pipeline'); ok(r.s === 200 && ['nuevo', 'contactado', 'calificado', 'interesado', 'negociacion', 'cerrado', 'perdido'].every(k => Array.isArray(r.j[k])) && r.j.interesado.length === 1 && r.j.nuevo.length === 1, 'pipeline: Record<etapa, contactos[]> con las 7 etapas');
r = await call(A, 'PUT', `/v1/contacts/${pedro.id}/stage`, { stage: 'calificado' }); ok(r.s === 200 && r.j.success === true && r.j.contact.stage === 'calificado', 'PUT :id/stage');
r = await call(A, 'PUT', `/v1/contacts/${pedro.id}/stage`, { stage: 'nada' }); ok(r.s === 400, 'stage inválido → 400');
r = await call(A, 'PUT', `/v1/contacts/${pedro.id}`, { name: 'Pedro G.', stage: 'negociacion', notes: 'ok' }); ok(r.s === 200 && r.j.name === 'Pedro G.' && r.j.stage === 'negociacion' && r.j.notes === 'ok' && r.j.phone === '+34600000002', 'PUT parcial conserva el resto', JSON.stringify(r.j));
r = await call(B, 'GET', `/v1/contacts/${ana.id}`); ok(r.s === 404, 'otro usuario no ve mi contacto');
r = await call(B, 'PUT', `/v1/contacts/${ana.id}`, { name: 'hack' }); ok(r.s === 404, 'otro usuario no edita mi contacto');
r = await call(B, 'PUT', `/v1/contacts/${ana.id}/stage`, { stage: 'cerrado' }); ok(r.s === 404, 'otro usuario no mueve mi contacto');
r = await call(B, 'DELETE', `/v1/contacts/${ana.id}`); ok(r.s === 404, 'otro usuario no borra mi contacto');
r = await call(B, 'GET', '/v1/contacts/pipeline'); ok(Object.values(r.j).every(l => l.length === 0), 'pipeline aislado');
r = await call(A, 'GET', '/v1/contacts/no-uuid'); ok(r.s === 400, 'id no UUID → 400');
const exp = await fetch(API + '/v1/contacts/export', { headers: { authorization: 'Bearer ' + A } }).then(x => x.text()); ok(exp.startsWith('nombre,telefono') && exp.includes('Ana Pérez'), 'export CSV');

// ── Conversaciones ──────────────────────────────────────────────────────────
r = await call(A, 'PUT', '/v1/ai-config', { agentName: 'Luna', businessName: 'Empresa a', businessType: 'Retail', tone: 'Cálido y profesional', systemPrompt: 'Vende ropa', greeting: 'Hola', salesFlow: '1. Saludar\n2. Ofrecer', restrictions: 'No dar descuentos', faq: '¿Envíos?: Gratis desde 50 USD\n¿Horario?: 9 a 18', isAiActive: true, model: 'gpt-4o-mini', temperature: 0.4, agentRole: 'Vendedora', language: 'Español', handoffKeywords: ['queja'], handoffMessage: 'Te paso con una persona.' });
ok(r.s === 200 && r.j.agentName === 'Luna' && r.j.isAiActive === true && r.j.faqItems.length === 2 && r.j.faq.startsWith('¿Envíos?: Gratis') && r.j.temperature === 0.4 && r.j.configured === true, 'ai-config PUT y mapeo de campos Replay', JSON.stringify(r.j));
await call(A, 'POST', '/v1/funnel/steps/apply-template/clinica');
r = await call(A, 'POST', `/v1/conversations/${ana.id}/incoming`, { text: 'Hola, busco información. Mi presupuesto es 200k' });
ok(r.s === 201 && r.j.message?.sender === 'customer' && r.j.reply?.sender === 'bot' && r.j.reply.conversationId === ana.id && keys(r.j.message, ['id', 'conversationId', 'content', 'sender', 'type', 'createdAt', 'status']), 'incoming simula cliente y el agente responde (forma Message)', JSON.stringify(r.j).slice(0, 300));
r = await call(A, 'GET', '/v1/conversations');
const convA = r.j.data?.find(c => c.id === ana.id);
ok(r.s === 200 && r.j.total >= 1 && convA && keys(convA, ['id', 'status', 'lastMessagePreview', 'lastMessageAt', 'unreadCount', 'contact']) && keys(convA.contact, ['id', 'name', 'phone', 'stage', 'email', 'city', 'ci', 'budget']), 'conversaciones: {data,total} con forma Conversation', JSON.stringify(r.j).slice(0, 300));
ok(convA.unreadCount === 1 && convA.status === 'bot' && convA.id === ana.id && convA.lastMessagePreview.length > 0, 'unreadCount real y status bot', JSON.stringify(convA));
ok(convA.contact.stage === 'calificado' && convA.contact.budget === '200k', 'contacto de la conversación refleja datos capturados por la IA', JSON.stringify(convA.contact));
r = await call(A, 'GET', `/v1/conversations/${ana.id}/messages?limit=100`); ok(r.s === 200 && Array.isArray(r.j) && r.j.length >= 2 && r.j[0].sender === 'customer' && r.j.at(-1).sender === 'bot' && new Date(r.j[0].createdAt) <= new Date(r.j.at(-1).createdAt), 'mensajes en orden cronológico con sender customer/bot', JSON.stringify(r.j).slice(0, 200));
r = await call(A, 'GET', `/v1/conversations/${ana.id}/messages?limit=1`); ok(r.j.length === 1 && r.j[0].sender === 'bot', 'limit devuelve los más recientes');
r = await call(A, 'PUT', `/v1/conversations/${ana.id}/read`); ok(r.j.success === true, 'marcar leída');
r = await call(A, 'GET', '/v1/conversations?filter=unread'); ok(!r.j.data.some(c => c.id === ana.id), 'filtro unread excluye leídas');
r = await call(A, 'POST', `/v1/conversations/${ana.id}/messages`, { text: 'Hola Ana, soy una persona del equipo' });
ok(r.s === 201 && r.j.sender === 'agent' && r.j.content.startsWith('Hola Ana') && r.j.direction === 'outbound', 'POST messages {text}: mensaje de agente humano', JSON.stringify(r.j));
r = await call(A, 'GET', '/v1/conversations?status=human'); ok(r.j.data.some(c => c.id === ana.id), 'tras responder una persona la conversación pasa a human', JSON.stringify(r.j.data.map(c => c.status)));
r = await call(A, 'POST', `/v1/conversations/${ana.id}/incoming`, { text: 'Gracias, ¿tenéis camisetas?' }); ok(r.j.reply === null && /pausó|humano/i.test(r.j.warning ?? ''), 'IA calla mientras un humano atiende', JSON.stringify(r.j).slice(0, 250));
r = await call(A, 'PUT', `/v1/conversations/${ana.id}/resume-bot`); ok(r.s === 200 && r.j.success === true && r.j.status === 'bot', 'resume-bot', JSON.stringify(r.j));
r = await call(A, 'POST', `/v1/conversations/${ana.id}/incoming`, { text: 'Hola otra vez' }); ok(r.j.reply?.sender === 'bot', 'tras resume-bot la IA vuelve a responder', JSON.stringify(r.j).slice(0, 200));
r = await call(A, 'PUT', `/v1/conversations/${ana.id}/pause-bot`); ok(r.j.status === 'human', 'pause-bot');
await call(A, 'PUT', `/v1/conversations/${ana.id}/resume-bot`);
r = await call(A, 'PUT', `/v1/conversations/${ana.id}/resolve`, { resolved: true }); ok(r.j.status === 'resolved', 'resolve');
r = await call(A, 'GET', '/v1/conversations?status=resolved'); ok(r.j.data.length === 1, 'filtro resolved');
await call(A, 'POST', `/v1/conversations/${ana.id}/incoming`, { text: 'Sigo aquí' }); r = await call(A, 'GET', '/v1/conversations?status=resolved'); ok(r.j.data.length === 0, 'un mensaje nuevo reabre la conversación');
r = await call(A, 'PUT', `/v1/conversations/${ana.id}/assign`, { agentId: aId }); ok(r.j.success === true, 'assign a mí mismo');
r = await call(A, 'PUT', `/v1/conversations/${ana.id}/assign`, { agentId: '99999999-9999-4999-8999-999999999999' }); ok(r.s === 400, 'assign a otro usuario → 400');
r = await call(A, 'GET', `/v1/conversations?search=${encodeURIComponent('+3460000000')}`); ok(r.j.data.length >= 1 && r.j.data.every(c => c.contact.phone.includes('+3460000000')), 'búsqueda de conversaciones (por teléfono)', JSON.stringify(r.j).slice(0, 200));
r = await call(A, 'POST', `/v1/conversations/${ana.id}/incoming`, { text: 'tengo una QUEJA' }); ok(r.j.reply?.content === 'Te paso con una persona.', 'palabra de derivación → handoff');
r = await call(A, 'GET', '/v1/conversations?status=human'); ok(r.j.data.some(c => c.id === ana.id), 'handoff pone la conversación en human');
r = await call(B, 'GET', '/v1/conversations'); ok(r.s === 200 && r.j.data.length === 0 && r.j.total === 0, 'conversaciones aisladas');
r = await call(B, 'GET', `/v1/conversations/${ana.id}/messages`); ok(r.s === 404, 'otro usuario no lee mensajes ajenos');
r = await call(B, 'POST', `/v1/conversations/${ana.id}/messages`, { text: 'intruso' }); ok(r.s === 404, 'otro usuario no escribe en mi conversación');
r = await call(A, 'POST', `/v1/conversations/${ana.id}/messages`, { text: '' }); ok(r.s === 400, 'mensaje vacío → 400');
r = await call(A, 'POST', `/v1/conversations/${ana.id}/messages`, { text: 'x'.repeat(5000) }); ok(r.s === 400, 'mensaje de 5000 car. → 400');
r = await call(A, 'GET', '/v1/conversations?status=raro'); ok(r.s === 400, 'status inválido → 400');

// ── Citas ───────────────────────────────────────────────────────────────────
r = await call(A, 'POST', '/v1/appointments', { contactName: 'Carla Nueva', contactPhone: '+34611000111', service: 'Limpieza', scheduledAt: isoIn(3 * 86400000), notes: 'n', googleMeetLink: 'https://meet.google.com/abc' });
ok(r.s === 201 && r.j.contact?.name === 'Carla Nueva' && r.j.service === 'Limpieza' && r.j.status === 'scheduled' && r.j.googleMeetLink.startsWith('https://') && r.j.scheduledAt, 'cita con contactName crea contacto y devuelve forma Replay', JSON.stringify(r.j));
const ap1 = r.j;
const cs = (await call(A, 'GET', '/v1/contacts?search=Carla')).j; ok(cs.data.length === 1 && cs.data[0].phone === '+34611000111', 'el contacto se creó por teléfono');
r = await call(A, 'POST', '/v1/appointments', { contactName: 'Carla Otra', contactPhone: '+34611000111', scheduledAt: isoIn(86400000) }); ok(r.j.contactId === ap1.contactId && r.j.service === 'Consulta', 'mismo teléfono reutiliza el contacto');
r = await call(A, 'POST', '/v1/appointments', { contactId: ana.id, service: 'Revisión', scheduledAt: isoIn(5 * 86400000), status: 'confirmed' }); ok(r.s === 201 && r.j.status === 'confirmed' && r.j.contact.id === ana.id, 'cita con contactId y status confirmed');
const ap3 = r.j;
r = await call(A, 'POST', '/v1/appointments', { scheduledAt: 'no-fecha' }); ok(r.s === 400, 'fecha inválida → 400');
r = await call(A, 'POST', '/v1/appointments', { scheduledAt: isoIn(1000), contactId: (await call(B, 'POST', '/v1/contacts', { name: 'Ajeno' })).j.id }); ok(r.s === 400, 'contactId de otro usuario → 400', r.s);
r = await call(A, 'POST', '/v1/appointments', { scheduledAt: isoIn(1000), status: 'raro' }); ok(r.s === 400, 'status inválido → 400');
r = await call(A, 'GET', '/v1/appointments'); ok(r.s === 200 && r.j.length >= 3 && r.j.every((a, i) => i === 0 || r.j[i - 1].scheduledAt <= a.scheduledAt), 'lista ordenada por fecha (incluye la cita que agendó la IA)', r.j.length);
r = await call(A, 'GET', `/v1/appointments?startDate=${encodeURIComponent(isoIn(4 * 86400000))}`); ok(r.j.length === 1 && r.j[0].id === ap3.id, 'filtro startDate');
r = await call(A, 'GET', `/v1/appointments?endDate=${encodeURIComponent(isoIn(2 * 86400000))}`); ok(r.j.length >= 1 && r.j.every(a => a.scheduledAt <= isoIn(2 * 86400000)), 'filtro endDate', r.j.length);
r = await call(A, 'GET', '/v1/appointments?startDate=zzz'); ok(r.s === 400, 'startDate inválida → 400');
r = await call(A, 'GET', '/v1/appointments?status=confirmed'); ok(r.j.length === 1 && r.j[0].id === ap3.id, 'filtro status (vocabulario Replay)');
r = await call(A, 'PATCH', `/v1/appointments/${ap1.id}/status`, { status: 'completed' }); ok(r.j.status === 'completed', 'PATCH :id/status');
r = await call(A, 'PATCH', `/v1/appointments/${ap1.id}/status`, { status: 'pending' }); ok(r.j.status === 'scheduled', 'status pending = scheduled');
r = await call(A, 'PUT', `/v1/appointments/${ap1.id}`, { service: 'Ortodoncia', scheduledAt: isoIn(6 * 86400000) }); ok(r.j.service === 'Ortodoncia' && r.j.contact?.name === 'Carla Nueva', 'PUT parcial');
r = await call(B, 'GET', `/v1/appointments/${ap1.id}`); ok(r.s === 404, 'cita ajena → 404');
r = await call(B, 'PATCH', `/v1/appointments/${ap1.id}/status`, { status: 'completed' }); ok(r.s === 404, 'otro usuario no cambia estado');
r = await call(B, 'GET', '/v1/appointments'); ok(r.j.length === 0, 'citas aisladas');
r = await call(A, 'DELETE', `/v1/appointments/${ap3.id}`); ok(r.j.success === true, 'borrar cita');

// ── Productos / inventario / BCV ────────────────────────────────────────────
r = await call(A, 'POST', '/v1/products', { name: 'Camiseta', description: 'Algodón', price: 20, sku: 'CAM-1', stock: 10, minStock: 4, cost: 8, isAvailable: true, currency: 'USD', userId: aId });
ok(r.s === 201 && keys(r.j, ['id', 'name', 'price', 'sku', 'stock', 'isAvailable', 'priceVef', 'currency', 'imageUrl']) && r.j.stock === 10 && r.j.isAvailable === true && r.j.priceVef === null, 'producto: forma Replay (isAvailable, stock, priceVef=null sin tasa)', JSON.stringify(r.j));
const cam = r.j;
r = await call(A, 'POST', '/v1/products/bcv-rate', { rate: 40 }); ok(r.s === 200 && r.j.rate === 40 && r.j.currency === 'VES/USD' && 'updatedAt' in r.j && 'auto' in r.j, 'POST bcv-rate', JSON.stringify(r.j));
r = await call(A, 'GET', '/v1/products/bcv-rate'); ok(r.j.rate === 40, 'GET bcv-rate');
r = await call(A, 'GET', '/v1/products'); ok(r.j[0].priceVef === 800 && r.j[0].bcvRate === 40, 'priceVef = precio × tasa', JSON.stringify(r.j[0]));
r = await call(A, 'POST', '/v1/products/bcv-rate', { rate: -1 }); ok(r.s === 400, 'tasa negativa → 400');
r = await call(A, 'POST', '/v1/products', { name: 'Otra', sku: 'CAM-1' }); ok(r.s === 400, 'SKU duplicado → 400');
r = await call(A, 'GET', `/v1/products/${cam.id}/movements`); ok(r.j.length === 1 && r.j[0].reason === 'Stock inicial', 'stock inicial en historial');
r = await call(A, 'PATCH', `/v1/products/${cam.id}/toggle-availability`); ok(r.j.isAvailable === false, 'toggle-availability');
r = await call(A, 'PUT', `/v1/products/${cam.id}`, { name: 'Camiseta Pro', price: 25, stock: 7, isAvailable: true }); ok(r.s === 200 && r.j.name === 'Camiseta Pro' && r.j.price === 25 && r.j.stock === 7 && r.j.isAvailable === true, 'PUT con stock → ajuste', JSON.stringify(r.j));
r = await call(A, 'GET', `/v1/products/${cam.id}/movements`); ok(r.j.length === 2 && r.j[0].type === 'adjust' && r.j[0].reason === 'Edición manual' && r.j[0].stockBefore === 10 && r.j[0].stockAfter === 7, 'el cambio de stock quedó como movimiento adjust');
r = await call(A, 'POST', `/v1/products/${cam.id}/stock`, { type: 'out', quantity: 100 }); ok(r.s === 400 && /insuficiente/i.test(JSON.stringify(r.j)), 'salida mayor al stock → 400');
r = await call(A, 'POST', `/v1/products/${cam.id}/stock`, { type: 'out', quantity: 5, reason: 'Venta' }); ok(r.j.product.stock === 2 && r.j.product.stockStatus === 'low' && r.j.movement.stockAfter === 2, 'salida de stock y stockStatus low');
r = await call(A, 'GET', '/v1/products/inventory/summary'); ok(r.j.units === 2 && r.j.lowStock === 1 && r.j.tracked === 1, 'resumen de inventario', JSON.stringify(r.j));
const svc = (await call(A, 'POST', '/v1/products', { name: 'Consultoría', price: 50, trackStock: false })).j; r = await call(A, 'POST', `/v1/products/${svc.id}/stock`, { type: 'in', quantity: 1 }); ok(r.s === 400, 'servicio sin inventario no admite movimientos');
r = await call(A, 'POST', '/v1/products/bcv-rate/refresh'); ok([200, 400].includes(r.s), 'bcv-rate/refresh responde (200 con tasa oficial, 400 si falla)', r.s);
r = await call(B, 'GET', `/v1/products/${cam.id}`); ok(r.s === 404, 'producto ajeno → 404');
r = await call(B, 'PUT', `/v1/products/${cam.id}`, { price: 1 }); ok(r.s === 404, 'otro usuario no edita producto');
r = await call(B, 'POST', `/v1/products/${cam.id}/stock`, { type: 'in', quantity: 5 }); ok(r.s === 404, 'otro usuario no mueve stock');
r = await call(B, 'PATCH', `/v1/products/${cam.id}/toggle-availability`); ok(r.s === 404, 'otro usuario no cambia disponibilidad');
r = await call(B, 'GET', '/v1/products'); ok(r.j.length === 0, 'productos aislados');
r = await call(B, 'GET', '/v1/products/bcv-rate'); ok(r.j.rate === null, 'tasa BCV aislada');
r = await call(A, 'DELETE', `/v1/products/${svc.id}`); ok(r.j.success === true, 'borrar producto');

// ── Plantillas ──────────────────────────────────────────────────────────────
r = await call(A, 'POST', '/v1/templates', { name: 'seguimiento_cliente', category: 'MARKETING', language: 'es', status: 'APPROVED', components: [{ type: 'BODY', text: 'Hola {{nombre}}, ¿sigues interesado?' }] });
ok(r.s === 201 && r.j.status === 'APPROVED' && r.j.category === 'MARKETING' && r.j.components[0].text.includes('{{nombre}}') && r.j.body.startsWith('Hola'), 'plantilla: forma Replay (status/components)', JSON.stringify(r.j));
const tpl = r.j;
r = await call(A, 'POST', '/v1/templates', { name: 'sin_texto' }); ok(r.s === 400, 'plantilla sin texto → 400');
r = await call(A, 'POST', '/v1/templates', { name: 'simple', body: 'Hola' }); ok(r.j.status === 'PENDING' && r.j.components[0].type === 'BODY', 'plantilla con body → componente BODY');
r = await call(A, 'GET', '/v1/templates'); ok(r.j.length === 2, 'lista de plantillas');
r = await call(A, 'PUT', `/v1/templates/${tpl.id}`, { status: 'REJECTED' }); ok(r.j.status === 'REJECTED' && r.j.name === 'seguimiento_cliente', 'PUT plantilla');
r = await call(B, 'GET', '/v1/templates'); ok(r.j.length === 0, 'plantillas aisladas');
r = await call(B, 'DELETE', `/v1/templates/${tpl.id}`); ok(r.s === 404, 'otro usuario no borra plantilla');
await call(A, 'PUT', `/v1/templates/${tpl.id}`, { status: 'APPROVED' });

// ── Conocimiento ────────────────────────────────────────────────────────────
const longText = Array.from({ length: 12 }, (_, i) => `Párrafo ${i}. ` + 'El horario de atención es de lunes a viernes. '.repeat(8)).join('\n\n');
r = await call(A, 'POST', '/v1/knowledge/document', { sourceFile: 'Manual.txt', text: longText }); ok(r.s === 201 && r.j.length > 1 && r.j.every((c, i) => c.sourceFile === 'Manual.txt' && c.chunkIndex === i && c.content.length <= 820), 'documento largo → varios chunks {sourceFile,chunkIndex,content}', r.j.length);
r = await call(A, 'POST', '/v1/knowledge/document', { text: 'Ubicación: Av. Principal 123. Estacionamiento gratuito para clientes.' }); ok(r.j[0].sourceFile === 'Manual Entry', 'sourceFile por defecto');
r = await call(A, 'GET', '/v1/knowledge/search?q=estacionamiento'); ok(r.j.length >= 1 && r.j[0].content.includes('Estacionamiento'), 'búsqueda léxica');
r = await call(A, 'POST', '/v1/knowledge/document', { text: '   ' }); ok(r.s === 400, 'texto vacío → 400', r.s);
r = await call(A, 'GET', '/v1/knowledge'); const total = r.j.length; ok(total > 2 && keys(r.j[0], ['id', 'sourceFile', 'chunkIndex', 'content', 'createdAt']), 'lista de chunks');
r = await call(B, 'GET', '/v1/knowledge'); ok(r.j.length === 0, 'conocimiento aislado');
r = await call(B, 'DELETE', `/v1/knowledge/chunk/${(await call(A, 'GET', '/v1/knowledge')).j[0].id}`); ok(r.s === 404, 'otro usuario no borra chunk');
r = await call(B, 'GET', '/v1/knowledge/search?q=horario'); ok(r.j.length === 0, 'búsqueda aislada');
r = await call(A, 'DELETE', `/v1/knowledge/chunk/${(await call(A, 'GET', '/v1/knowledge')).j[0].id}`); ok(r.j.success === true, 'borrar chunk');
r = await call(A, 'DELETE', '/v1/knowledge/clear'); ok(r.j.success === true && r.j.deleted === total - 1, 'clear borra todo lo mío', JSON.stringify(r.j));

// ── Funnel: reglas (formato Replay) y pasos ─────────────────────────────────
r = await call(A, 'POST', '/v1/funnel/rules', { name: 'Seguimiento 24h', trigger: 'inactivity_24h', conditions: { stage: 'contactado', waitHours: 1 }, actions: { sendTemplate: 'seguimiento_cliente', moveStage: 'interesado' }, isActive: true });
ok(r.s === 201 && r.j.trigger === 'inactivity_24h' && r.j.conditions.stage === 'contactado' && r.j.conditions.waitHours === 1 && r.j.actions.sendTemplate === 'seguimiento_cliente' && r.j.actions.moveStage === 'interesado' && r.j.isActive === true, 'regla inactivity_24h: round-trip de formato Replay', JSON.stringify(r.j));
const rule1 = r.j;
r = await call(A, 'POST', '/v1/funnel/rules', { name: 'Cita → negociación', trigger: 'post_appointment', conditions: { event: 'appointment_created' }, actions: { moveStage: 'negociacion', sendText: 'Gracias {{nombre}}, cita registrada' } }); ok(r.s === 201 && r.j.trigger === 'post_appointment' && r.j.actions.moveStage === 'negociacion', 'regla post_appointment');
const rule2 = r.j;
r = await call(A, 'POST', '/v1/funnel/rules', { name: 'Cerrado', trigger: 'stage_changed', conditions: { toStage: 'cerrado' }, actions: { sendText: '¡Gracias por tu compra, {{nombre}}!' } }); ok(r.s === 201 && r.j.trigger === 'stage_changed' && r.j.conditions.toStage === 'cerrado', 'regla stage_changed');
const rule3 = r.j;
r = await call(A, 'POST', '/v1/funnel/rules', { name: 'Sin acción', trigger: 'stage_changed' }); ok(r.s === 400, 'regla sin acción → 400');
r = await call(A, 'POST', '/v1/funnel/rules', { name: 'Mala', trigger: 'otro', actions: { sendText: 'x' } }); ok(r.s === 400, 'trigger inválido → 400');
r = await call(A, 'POST', '/v1/funnel/rules', { name: 'Modal', trigger: 'inactivity_24h', stageFrom: 'nuevo', stageTo: 'contactado', templateName: 'seguimiento_cliente' }); ok(r.s === 201 && r.j.conditions.stage === 'nuevo' && r.j.actions.moveStage === 'contactado' && r.j.actions.sendTemplate === 'seguimiento_cliente', 'acepta los campos del modal de Replay (stageFrom/stageTo/templateName)', JSON.stringify(r.j));
await call(A, 'DELETE', `/v1/funnel/rules/${r.j.id}`);
r = await call(A, 'PATCH', `/v1/funnel/rules/${rule1.id}/toggle`); ok(r.j.isActive === false, 'toggle regla'); await call(A, 'PATCH', `/v1/funnel/rules/${rule1.id}/toggle`);
r = await call(A, 'PUT', `/v1/funnel/rules/${rule1.id}`, { name: 'Seguimiento 1h', conditions: { waitHours: 1 } }); ok(r.j.name === 'Seguimiento 1h' && r.j.conditions.stage === 'contactado' && r.j.actions.sendTemplate === 'seguimiento_cliente', 'PUT regla conserva lo no enviado', JSON.stringify(r.j));
r = await call(A, 'GET', '/v1/funnel/rules'); ok(r.j.length === 3 && keys(r.j[0], ['id', 'name', 'trigger', 'conditions', 'actions', 'isActive']), 'lista de reglas');
r = await call(B, 'PATCH', `/v1/funnel/rules/${rule1.id}/toggle`); ok(r.s === 404, 'otro usuario no toca mis reglas');
r = await call(B, 'GET', '/v1/funnel/rules'); ok(r.j.length === 0, 'reglas aisladas');
// ejecución real de las reglas
const cl = (await call(A, 'POST', '/v1/contacts', { name: 'Carla Cita', phone: '+34633000333' })).j;
await call(A, 'POST', '/v1/appointments', { contactId: cl.id, service: 'Visita', scheduledAt: isoIn(9 * 86400000) }); await sleep(1500);
let msgs = (await call(A, 'GET', `/v1/conversations/${cl.id}/messages`)).j; let cc = (await call(A, 'GET', `/v1/contacts/${cl.id}`)).j;
ok(cc.stage === 'negociacion' && msgs.some(m => m.content === 'Gracias Carla, cita registrada' && m.sender === 'bot' && m.automated === true), 'regla post_appointment se ejecuta (mueve etapa y envía)', JSON.stringify({ s: cc.stage, m: msgs.map(m => m.content) }));
await call(A, 'PUT', `/v1/contacts/${cl.id}/stage`, { stage: 'cerrado' }); await sleep(1500);
msgs = (await call(A, 'GET', `/v1/conversations/${cl.id}/messages`)).j; ok(msgs.some(m => m.content === '¡Gracias por tu compra, Carla!'), 'regla stage_changed se ejecuta');
const rr = (await call(A, 'GET', '/v1/funnel/rules')).j; ok(rr.find(x => x.id === rule2.id).runs === 1 && rr.find(x => x.id === rule3.id).runs === 1, 'contador de ejecuciones', JSON.stringify(rr.map(x => x.runs)));
const ic = (await call(A, 'POST', '/v1/contacts', { name: 'Iván Inactivo', phone: '+34644000444', stage: 'contactado' })).j;
await call(A, 'POST', `/v1/conversations/${ic.id}/messages`, { text: 'Te paso la info' }); await db.query(`UPDATE messages SET "createdAt" = now() - interval '3 hours' WHERE "contactId" = $1`, [ic.id]); await db.query(`UPDATE contacts SET "botPausedUntil" = NULL WHERE id = $1`, [ic.id]);
await call(A, 'PATCH', `/v1/funnel/rules/${rule2.id}/toggle`); await call(A, 'PATCH', `/v1/funnel/rules/${rule3.id}/toggle`);
// el planificador está desactivado (SCHEDULER=off): no verificamos la ejecución por inactividad aquí (cubierta en api-test.mjs nativo)

// ── Webhooks ────────────────────────────────────────────────────────────────
r = await call(A, 'POST', '/v1/webhooks', { name: 'Receptor', url: 'http://localhost:9912/hook', secret: 'whsec_mio', events: ['lead.stage_changed', 'message.received', 'inventado'], isActive: true });
ok(r.s === 201 && r.j.isActive === true && r.j.secret.startsWith('whsec_') && r.j.secret !== 'whsec_mio' && r.j.secret.length > 30 && r.j.events.length === 2 && !r.j.events.includes('inventado'), 'webhook: secreto generado por el servidor y eventos filtrados', JSON.stringify(r.j));
const wh = r.j;
r = await call(A, 'POST', '/v1/webhooks', { name: 'x', url: 'ftp://x.com/h' }); ok(r.s === 400, 'webhook: solo http(s)');
r = await call(A, 'POST', '/v1/webhooks', { name: 'x' }); ok(r.s === 400, 'webhook: url obligatoria');
r = await call(A, 'PATCH', `/v1/webhooks/${wh.id}`, { url: 'file:///etc/passwd' }); ok(r.s === 400, 'editar webhook valida la URL');
r = await call(A, 'PATCH', `/v1/webhooks/${wh.id}/toggle`); ok(r.j.isActive === false, 'toggle webhook'); await call(A, 'PATCH', `/v1/webhooks/${wh.id}/toggle`);
r = await call(A, 'POST', `/v1/webhooks/${wh.id}/test`); ok(r.s === 200 && r.j.status === 200 && r.j.targetUrl === wh.url && r.j.payload.event === 'test.ping' && r.j.deliveredAt, 'webhook test: {status,deliveredAt,targetUrl,payload}', JSON.stringify(r.j));
r = await call(A, 'GET', '/v1/webhooks/events'); ok(r.j.includes('lead.stage_changed') && r.j.includes('message.received'), 'catálogo de eventos incluye los de Replay');
r = await call(B, 'GET', '/v1/webhooks'); ok(r.j.length === 0, 'webhooks aislados');
r = await call(B, 'POST', `/v1/webhooks/${wh.id}/test`); ok(r.s === 404, 'otro usuario no dispara mi webhook');
r = await call(B, 'DELETE', `/v1/webhooks/${wh.id}`); ok(r.s === 404, 'otro usuario no borra mi webhook');

// ── ai-config ───────────────────────────────────────────────────────────────
r = await call(A, 'GET', '/v1/ai-config'); ok(keys(r.j, ['agentName', 'agentRole', 'businessName', 'businessType', 'language', 'tone', 'model', 'temperature', 'systemPrompt', 'greeting', 'salesFlow', 'restrictions', 'faq', 'isAiActive']) && typeof r.j.faq === 'string', 'ai-config: campos de la UI de Replay');
r = await call(B, 'GET', '/v1/ai-config'); ok(r.j.agentName === '' || r.j.agentName === undefined || r.j.configured === false, 'ai-config aislada (B parte de cero)', JSON.stringify(r.j).slice(0, 150));
r = await call(A, 'PUT', '/v1/ai-config', { temperature: 5 }); ok(r.s === 400, 'temperature fuera de rango → 400');
r = await call(A, 'PUT', '/v1/ai-config', { hours: { enabled: true, days: [9], start: '09:00', end: '18:00' } }); ok(r.s === 400, 'hours inválidas → 400');
r = await call(A, 'PUT', '/v1/ai-config', { faqItems: [{ question: 'Q', answer: 'A' }] }); ok(r.j.faq === 'Q: A', 'faqItems ↔ faq texto');
r = await call(A, 'GET', '/v1/ai-config/templates'); ok(r.j.length === 4 && ['clinica', 'restaurante', 'inmobiliaria', 'retail'].every(id => r.j.some(t => t.id === id)) && keys(r.j[0], ['id', 'icon', 'title', 'badge', 'agentName', 'agentRole', 'personality', 'greeting', 'salesFlow', 'restrictions', 'faq']), 'plantillas del sistema (4 rubros)');
for (const t of ['clinica', 'restaurante', 'inmobiliaria', 'retail']) { r = await call(A, 'POST', `/v1/ai-config/apply-template/${t}`); ok(r.s === 200 && r.j.success === true && r.j.applied === t && r.j.agentName && r.j.salesFlow && r.j.faqItems.length >= 2, `apply-template/${t}`, JSON.stringify(r.j).slice(0, 200)); }
r = await call(A, 'POST', '/v1/ai-config/apply-template/nada'); ok(r.s === 404, 'plantilla inexistente → 404');
r = await call(A, 'POST', '/v1/ai-config/test', { message: '¿Qué horario tienen?' }); ok(r.s === 200 && typeof r.j.response === 'string', 'ai-config/test responde con el modelo (simulado)', JSON.stringify(r.j).slice(0, 200));
const before = (await call(A, 'GET', '/v1/conversations')).j.total; r = await call(A, 'POST', '/v1/ai-config/test', { message: 'hola' }); ok((await call(A, 'GET', '/v1/conversations')).j.total === before, 'test no guarda conversaciones');
r = await call(A, 'POST', '/v1/ai-config/test', {}); ok(r.s === 400, 'test sin mensaje → 400');

// ── WhatsApp ────────────────────────────────────────────────────────────────
r = await call(A, 'GET', '/v1/whatsapp/status'); ok(r.s === 200 && r.j.connected === false && 'webhookUrl' in r.j && 'phoneNumber' in r.j && 'qualityRating' in r.j, 'whatsapp status sin conectar');
r = await call(A, 'POST', '/v1/whatsapp/connect', { phoneNumberId: 'PNV1' + uniq, accessToken: 'EAAB-secret-token-123456', wabaId: 'WABA1' }); ok(r.s === 200 && r.j.connected && r.j.phoneNumberId === 'PNV1' + uniq && r.j.wabaId === 'WABA1' && r.j.verifyToken && !JSON.stringify(r.j).includes('EAAB'), 'conectar: nunca devuelve el token', JSON.stringify(r.j));
const vt = r.j.verifyToken;
r = await call(A, 'GET', '/v1/whatsapp/status'); ok(r.j.connected && r.j.phoneNumber && r.j.verifyToken === vt && !JSON.stringify(r.j).includes('EAAB'), 'status conectado sin secretos');
const raw = (await db.query(`SELECT "accessToken" FROM whatsapp_accounts WHERE "userId" = $1`, [aId])).rows[0].accessToken; ok(raw.startsWith('enc:v1:'), 'token cifrado en la BD');
r = await call(A, 'POST', '/v1/whatsapp/verify-token/rotate'); ok(r.j.verifyToken && r.j.verifyToken !== vt, 'rotar token de verificación');
r = await call(B, 'POST', '/v1/whatsapp/connect', { phoneNumberId: 'PNV1' + uniq, accessToken: 'EAAB-otro-token-123456' }); ok(r.s === 409, 'mismo número en otra cuenta → 409');
r = await call(B, 'GET', '/v1/whatsapp/status'); ok(r.j.connected === false, 'status aislado');
r = await call(A, 'POST', '/v1/whatsapp/connect', { phoneNumberId: 'x', accessToken: 'corto' }); ok(r.s === 400, 'connect valida longitudes');

// ── Dashboard y reportes ────────────────────────────────────────────────────
r = await call(A, 'GET', '/v1/dashboard/stats?period=7');
const d = r.j;
ok(r.s === 200 && keys(d, ['aiMessages', 'humanMessages', 'newLeads', 'totalContacts', 'appointmentsToday', 'appointmentsWeek', 'automationRate', 'pipeline', 'trend', 'lowStock']) && d.pipeline.length === 7 && d.pipeline.every(x => 'stage' in x && 'count' in x) && d.trend.length === 7 && keys(d.trend[0], ['date', 'ai', 'human']), 'dashboard: forma DashboardStats', JSON.stringify(d).slice(0, 300));
ok(d.totalContacts >= 5 && d.newLeads >= 5 && d.aiMessages >= 3 && d.humanMessages >= 1 && d.appointmentsWeek >= 1 && d.lowStock === 1 && d.automationRate > 0, 'dashboard: cifras reales', JSON.stringify(d).slice(0, 400));
ok(d.trend.at(-1).ai >= 3, 'dashboard: tendencia de hoy refleja actividad');
r = await call(A, 'GET', '/v1/dashboard/stats?period=90'); ok(r.j.trend.length === 90, 'periodo 90');
r = await call(A, 'GET', '/v1/dashboard/stats?period=abc'); ok(r.j.trend.length === 7, 'periodo inválido → 7 por defecto');
r = await call(B, 'GET', '/v1/dashboard/stats'); ok(r.j.totalContacts === 1 && r.j.aiMessages === 0 && r.j.humanMessages === 0, 'dashboard aislado (B solo ve su contacto)', JSON.stringify(r.j).slice(0, 200));
r = await call(A, 'GET', '/v1/reports/summary?period=30'); const s = r.j;
ok(r.s === 200 && keys(s, ['totalContacts', 'wonContacts', 'lostContacts', 'conversionRate', 'stageCounts', 'appointmentsCount', 'newLeads', 'qualifiedLeads', 'funnel', 'hours', 'timeline', 'weeklyActivity', 'messagesPerLead', 'peakHour', 'responseRate']) && s.hours.length === 24 && s.weeklyActivity.length === 7 && keys(s.weeklyActivity[0], ['day', 'inbound', 'outboundAi', 'human']) && s.timeline.leads.length === 30, 'reportes: forma de resumen', JSON.stringify(s).slice(0, 300));
ok(s.totalContacts === d.totalContacts && s.stageCounts.cerrado === 1 && s.wonContacts === 1 && s.appointmentsCount >= 2 && s.funnel[0].stage === 'nuevo' && s.aiResponseTimeAvgSeconds !== undefined, 'reportes: cifras coherentes con dashboard', JSON.stringify({ t: s.totalContacts, st: s.stageCounts }));
r = await call(B, 'GET', '/v1/reports/summary'); ok(r.j.totalContacts === 1 && r.j.appointmentsCount === 0, 'reportes aislados');

// ── Tiempo real (namespace /ws) ─────────────────────────────────────────────
const sock = (token, ns = '/ws') => new Promise(res => { const s = io(API + ns, { auth: token ? { token } : {}, transports: ['websocket'], reconnection: false, forceNew: true }); const o = { ev: [], closed: false, s }; s.onAny((e, p) => o.ev.push([e, p])); s.on('disconnect', () => (o.closed = true)); setTimeout(() => res(o), 1200); });
const [n0, nBad, sA, sB, sLegacy] = await Promise.all([sock(null), sock('xxx'), sock(A), sock(B), sock(A, '/')]);
ok(n0.closed && nBad.closed, 'ws: sin token o con token falso se desconecta');
ok(!sA.closed && !sB.closed, 'ws: JWT válido se mantiene');
const live = (await call(A, 'POST', '/v1/contacts', { name: 'En Vivo', phone: '+34655000555' })).j;
await call(A, 'POST', `/v1/conversations/${live.id}/incoming`, { text: 'hola en vivo' });
sA.s.emit('join_conversation', { conversationId: live.id }); sB.s.emit('join_conversation', { conversationId: live.id });
await sleep(600);
sA.s.emit('typing', { conversationId: live.id, isTyping: true }); await sleep(300);
await call(A, 'POST', `/v1/conversations/${live.id}/messages`, { text: 'te atiende una persona' }); await sleep(300);
await call(A, 'PUT', `/v1/conversations/${live.id}/resume-bot`); await sleep(300);
await call(A, 'PUT', `/v1/contacts/${live.id}/stage`, { stage: 'interesado' }); await sleep(300);
await call(A, 'POST', '/v1/appointments', { contactId: live.id, service: 'Cita viva', scheduledAt: isoIn(86400000 * 4) }); await sleep(700);
const names = sA.ev.map(e => e[0]);
const nm = sA.ev.filter(e => e[0] === 'new_message');
ok(nm.length >= 3 && nm.every(([, p]) => p.conversationId === live.id && p.message?.content && p.message.sender), 'ws: new_message {conversationId, message}', JSON.stringify(nm).slice(0, 200));
ok(nm.some(([, p]) => p.message.sender === 'customer') && nm.some(([, p]) => p.message.sender === 'bot') && nm.some(([, p]) => p.message.sender === 'agent'), 'ws: new_message para cliente, bot y agente');
ok(names.includes('agent_resumed') && names.includes('conversation_updated'), 'ws: agent_resumed y conversation_updated', names.join());
ok(sA.ev.some(([e, p]) => e === 'contact_stage_changed' && p.contactId === live.id && p.to === 'interesado'), 'ws: contact_stage_changed');
ok(sA.ev.some(([e, p]) => e === 'appointment_booked' && p.appointment?.service === 'Cita viva' && p.appointment.contact?.id === live.id), 'ws: appointment_booked');
ok(sA.ev.some(([e]) => e === 'crm'), 'ws: evento genérico crm');
await call(A, 'POST', `/v1/conversations/${live.id}/incoming`, { text: 'quiero poner una queja' }); await sleep(500);
ok(sA.ev.some(([e, p]) => e === 'human_intervention' && p.conversationId === live.id), 'ws: human_intervention');
ok(sB.ev.length === 0, 'ws: otro usuario NO recibe eventos ajenos (ni al unirse a mi sala)', JSON.stringify(sB.ev).slice(0, 200));
const sA2 = await sock(A); sA2.s.emit('join_conversation', { conversationId: live.id }); await sleep(300); sA.s.emit('typing', { conversationId: live.id, isTyping: true }); await sleep(500);
ok(sA2.ev.some(([e, p]) => e === 'typing' && p.isTyping === true && p.userId === aId), 'ws: typing se reenvía a otros sockets del mismo usuario en la conversación', JSON.stringify(sA2.ev).slice(0, 200));
ok(!sB.ev.some(([e]) => e === 'typing'), 'ws: typing no cruza usuarios');
ok(sLegacy.ev.some(([e]) => e === 'crm') && !sLegacy.ev.some(([e]) => e === 'new_message'), 'ws: namespace raíz sigue emitiendo solo crm', JSON.stringify({ closed: sLegacy.closed, ev: sLegacy.ev.map(e => e[0]) }));
[n0, nBad, sA, sB, sLegacy, sA2].forEach(x => x.s.close());

// ── Límite de tamaño y asignación masiva transversal ────────────────────────
r = await call(A, 'POST', '/v1/contacts', { name: 'N'.repeat(500) }); ok(r.s === 400, 'nombre demasiado largo → 400');
r = await call(A, 'POST', '/v1/knowledge/document', { text: 'x'.repeat(250_000) }); ok(r.s === 400 || r.s === 413, 'documento enorme rechazado', r.s);

console.log(`\nRESULTADO v1: ${pass} PASS / ${fail} FAIL`);
await db.end();
process.exit(fail ? 1 : 0);
