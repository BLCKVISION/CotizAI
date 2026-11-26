import { thumbOf } from '../media/product-images.js';
import type { ProductStats } from '../crm/product-stats.service.js';
import { AgentConfig, Appointment, AutomationRule, Contact, KnowledgeDoc, Message, Product, WaTemplate, AUTOMATION_TRIGGERS } from '../crm/entities.js';

/** Funciones puras que traducen nuestro modelo a las formas que espera el frontend de Replay (y al revés). */

// ── Utilidades ──────────────────────────────────────────────────────────────
export const clampInt = (v: unknown, def: number, min: number, max: number) => {
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : def;
};

/** Escapa los comodines de LIKE para que la búsqueda del usuario sea literal. */
export const likePattern = (s: string) => `%${s.replace(/[\\%_]/g, m => '\\' + m)}%`;

export const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'empresa';

const pick = (data: Record<string, unknown> | null | undefined, keys: string[]) => {
  for (const k of keys) { const v = data?.[k]; if (typeof v === 'string' && v) return v; }
  return null;
};

// ── Contactos ───────────────────────────────────────────────────────────────
export function contactView(c: Contact) {
  return {
    id: c.id, name: c.name, phone: c.phone, email: c.email, stage: c.status, status: c.status, score: c.score, source: c.source,
    notes: c.notes, tags: c.tags ?? [], needsHuman: c.needsHuman, avatarUrl: null,
    city: pick(c.data, ['city', 'ciudad']), ci: pick(c.data, ['ci', 'cedula', 'cédula']), budget: pick(c.data, ['budget', 'presupuesto']),
    data: c.data ?? {}, createdAt: c.createdAt, updatedAt: c.updatedAt,
  };
}

// ── Conversaciones y mensajes ───────────────────────────────────────────────
export type ConvStatus = 'bot' | 'human' | 'resolved';

export function convStatus(c: Pick<Contact, 'resolved' | 'needsHuman' | 'botPausedUntil'>, now = Date.now()): ConvStatus {
  if (c.resolved) return 'resolved';
  if (c.needsHuman || (c.botPausedUntil && +new Date(c.botPausedUntil) > now)) return 'human';
  return 'bot';
}

export const senderOut = (s: Message['sender']) => ({ client: 'customer', human: 'agent', ai: 'bot', auto: 'bot' })[s] ?? 'system';

export function messageView(m: Pick<Message, 'id' | 'contactId' | 'body' | 'sender' | 'direction' | 'createdAt'>) {
  return {
    id: m.id, conversationId: m.contactId, content: m.body, sender: senderOut(m.sender), automated: m.sender === 'auto',
    type: 'text' as const, direction: m.direction === 'in' ? 'inbound' : 'outbound', status: m.direction === 'in' ? 'read' : 'sent', createdAt: m.createdAt,
  };
}

// ── Citas ───────────────────────────────────────────────────────────────────
const APPT_OUT: Record<string, string> = { pendiente: 'scheduled', confirmada: 'confirmed', completada: 'completed', cancelada: 'cancelled', no_asistio: 'no_show' };
const APPT_IN: Record<string, string> = {
  scheduled: 'pendiente', pending: 'pendiente', pendiente: 'pendiente', confirmed: 'confirmada', confirmada: 'confirmada',
  completed: 'completada', completada: 'completada', cancelled: 'cancelada', canceled: 'cancelada', cancelada: 'cancelada', no_show: 'no_asistio', no_asistio: 'no_asistio',
};
export const APPOINTMENT_STATUS_INPUTS = Object.keys(APPT_IN);
export const apptStatusIn = (s: string | undefined | null) => (s ? APPT_IN[s] ?? null : null);

export function apptView(a: Appointment, contact?: Pick<Contact, 'id' | 'name' | 'phone'> | null) {
  return {
    id: a.id, contactId: a.contactId, contact: contact ? { id: contact.id, name: contact.name, phone: contact.phone } : null,
    service: a.service || a.title, title: a.title, scheduledAt: a.startsAt, endsAt: a.endsAt, status: APPT_OUT[a.status] ?? a.status,
    notes: a.notes, googleMeetLink: a.googleMeetLink, createdBy: a.createdBy, createdAt: a.createdAt,
  };
}

// ── Productos ───────────────────────────────────────────────────────────────
export function productView(p: Product, rate: number | null, stats?: ProductStats | null) {
  const stockStatus = !p.trackStock ? 'untracked' : p.stock <= 0 ? 'out' : p.stock <= p.minStock ? 'low' : 'ok';
  return {
    id: p.id, name: p.name, description: p.description, price: p.price, currency: p.currency || 'USD', imageUrl: p.imageUrl, thumbUrl: thumbOf(p.imageUrl), sku: p.sku, category: p.category,
    isAvailable: p.active, active: p.active, cost: p.cost, trackStock: p.trackStock, stock: p.stock, minStock: p.minStock,
    priceVef: rate ? Math.round(p.price * rate * 100) / 100 : null, bcvRate: rate, stockStatus, stats: stats ?? null, createdAt: p.createdAt, updatedAt: p.updatedAt,
  };
}

// ── Plantillas de WhatsApp ──────────────────────────────────────────────────
const TPL_OUT: Record<string, string> = { aprobada: 'APPROVED', pendiente: 'PENDING', rechazada: 'REJECTED', desactivada: 'DISABLED' };
const TPL_IN: Record<string, string> = { approved: 'aprobada', aprobada: 'aprobada', pending: 'pendiente', pendiente: 'pendiente', rejected: 'rechazada', rechazada: 'rechazada', disabled: 'desactivada', desactivada: 'desactivada' };
export const TEMPLATE_STATUS_INPUTS = [...new Set([...Object.keys(TPL_IN), ...Object.values(TPL_OUT)])];
export const tplStatusIn = (s: string | undefined | null) => (s ? TPL_IN[s.toLowerCase()] ?? null : null);

export function templateView(t: WaTemplate) {
  const components = t.components?.length ? t.components : [{ type: 'BODY', text: t.body }];
  return { id: t.id, name: t.name, category: t.category, language: t.language, status: TPL_OUT[t.status] ?? t.status, components, body: t.body, createdAt: t.createdAt };
}

/** Texto del BODY de una lista de componentes estilo Meta. */
export const bodyOf = (components: { type: string; text?: string }[] | undefined) => components?.find(c => c.type?.toUpperCase() === 'BODY')?.text ?? '';

// ── Conocimiento ────────────────────────────────────────────────────────────
export const chunkView = (d: KnowledgeDoc) => ({ id: d.id, sourceFile: d.title, chunkIndex: d.chunkIndex, content: d.content, createdAt: d.createdAt });

/** Parte un texto largo en fragmentos de ~size caracteres respetando párrafos y, si hace falta, frases. */
export function chunkText(text: string, size = 800): string[] {
  const parts: string[] = [];
  for (const para of text.replace(/\r\n/g, '\n').split(/\n{2,}/).map(p => p.trim()).filter(Boolean)) {
    if (para.length <= size) { parts.push(para); continue; }
    let cur = '';
    for (const sentence of para.split(/(?<=[.!?])\s+/)) {
      if ((cur + ' ' + sentence).trim().length > size && cur) { parts.push(cur.trim()); cur = ''; }
      let s = sentence;
      while (s.length > size) { parts.push(s.slice(0, size)); s = s.slice(size); }
      cur = (cur + ' ' + s).trim();
    }
    if (cur) parts.push(cur);
  }
  // une fragmentos pequeños consecutivos
  const out: string[] = [];
  for (const p of parts) {
    const last = out[out.length - 1];
    if (last !== undefined && last.length + p.length + 2 <= size) out[out.length - 1] = last + '\n\n' + p;
    else out.push(p);
  }
  return out;
}

// ── FAQ: texto "pregunta: respuesta" por línea ↔ lista ──────────────────────
export function parseFaq(text: string | undefined | null) {
  const items: { question: string; answer: string }[] = [];
  for (const line of String(text ?? '').split('\n')) {
    const i = line.indexOf(': ');
    const question = (i < 0 ? line : line.slice(0, i)).trim();
    const answer = (i < 0 ? '' : line.slice(i + 2)).trim();
    if (question && answer) items.push({ question: question.slice(0, 300), answer: answer.slice(0, 1500) });
  }
  return items.slice(0, 50);
}
export const formatFaq = (items: { question: string; answer: string }[] | undefined) => (items ?? []).map(f => `${f.question}: ${f.answer}`).join('\n');

// ── Reglas de automatización (funnel) ───────────────────────────────────────
export const REPLAY_TRIGGERS = ['inactivity_24h', 'post_appointment', 'stage_changed'] as const;
const TRIGGER_IN: Record<string, (typeof AUTOMATION_TRIGGERS)[number]> = {
  inactivity_24h: 'inactivity', inactivity: 'inactivity', post_appointment: 'appointment_created', appointment_created: 'appointment_created', stage_changed: 'status_changed', status_changed: 'status_changed',
};
const TRIGGER_OUT = { inactivity: 'inactivity_24h', appointment_created: 'post_appointment', status_changed: 'stage_changed' } as const;
export const RULE_TRIGGER_INPUTS = Object.keys(TRIGGER_IN);

export interface RuleInput {
  name?: string; trigger?: string; isActive?: boolean; active?: boolean;
  conditions?: { stage?: string; stageFrom?: string; waitHours?: number; toStage?: string; stageTo?: string; event?: string; tag?: string };
  actions?: { moveStage?: string; sendTemplate?: string; sendText?: string };
  stageFrom?: string; stageTo?: string; templateName?: string;
}

export function ruleFromV1(i: RuleInput): Partial<Pick<AutomationRule, 'name' | 'trigger' | 'conditions' | 'actions' | 'active' | 'templateName'>> {
  const out: ReturnType<typeof ruleFromV1> = {};
  if (i.name !== undefined) out.name = i.name;
  const trigger = i.trigger ? TRIGGER_IN[i.trigger] : undefined;
  if (trigger) out.trigger = trigger;
  const active = i.isActive ?? i.active;
  if (active !== undefined) out.active = active;
  if (i.conditions || i.stageFrom || trigger) {
    const c = i.conditions ?? {};
    const cond: AutomationRule['conditions'] = {};
    const stage = c.stage ?? c.stageFrom ?? i.stageFrom;
    if (trigger === 'inactivity' || (!trigger && stage)) { if (stage) cond.status = stage; cond.waitHours = c.waitHours ?? 24; }
    if (trigger === 'status_changed') { const to = c.toStage ?? c.stageTo; if (to) cond.toStatus = to; }
    out.conditions = cond;
  }
  if (i.actions || i.stageTo || i.templateName || trigger) {
    const a = i.actions ?? {};
    const act: AutomationRule['actions'] = {};
    const move = a.moveStage ?? i.stageTo;
    if (move) act.moveStatus = move;
    if (a.sendText) act.sendText = a.sendText;
    out.actions = act;
    out.templateName = a.sendTemplate ?? i.templateName ?? '';
  }
  return out;
}

export function ruleToV1(r: AutomationRule) {
  const conditions: Record<string, unknown> = {};
  if (r.trigger === 'inactivity') { if (r.conditions.status) conditions['stage'] = r.conditions.status; conditions['waitHours'] = r.conditions.waitHours ?? 24; }
  if (r.trigger === 'status_changed' && r.conditions.toStatus) conditions['toStage'] = r.conditions.toStatus;
  if (r.trigger === 'appointment_created') conditions['event'] = 'appointment_created';
  const actions: Record<string, unknown> = {};
  if (r.actions.moveStatus) actions['moveStage'] = r.actions.moveStatus;
  if (r.templateName) actions['sendTemplate'] = r.templateName;
  if (r.actions.sendText) actions['sendText'] = r.actions.sendText;
  return { id: r.id, name: r.name, trigger: TRIGGER_OUT[r.trigger], conditions, actions, isActive: r.active, runs: r.runs, lastRunAt: r.lastRunAt, createdAt: r.createdAt };
}

// ── Configuración del agente (ai-config) ────────────────────────────────────
export function agentToV1(a: AgentConfig) {
  return {
    configured: a.configured, agentName: a.name, agentRole: a.agentRole, businessName: a.businessName, businessType: a.industry, language: a.language,
    tone: a.tone, personality: a.personality, model: a.model, temperature: a.temperature, systemPrompt: a.instructions, greeting: a.greeting,
    salesFlow: a.salesFlow, restrictions: a.restrictions, faq: formatFaq(a.faq), faqItems: a.faq ?? [], isAiActive: a.enabled,
    handoffKeywords: a.handoffKeywords ?? [], handoffMessage: a.handoffMessage, hours: a.hours, outOfHoursMessage: a.outOfHoursMessage,
  };
}

export interface AiConfigInput {
  agentName?: string; agentRole?: string; businessName?: string; businessType?: string; language?: string; tone?: string; personality?: string; model?: string;
  temperature?: number; systemPrompt?: string; greeting?: string; salesFlow?: string; restrictions?: string; faq?: string; faqItems?: { question: string; answer: string }[];
  isAiActive?: boolean; handoffKeywords?: string[]; handoffMessage?: string; hours?: AgentConfig['hours']; outOfHoursMessage?: string;
}

/** Solo devuelve las claves presentes, para poder mezclarlas con Object.assign sobre la fila actual. */
export function agentFromV1(i: AiConfigInput): Partial<AgentConfig> {
  const o: Partial<AgentConfig> = {};
  const set = <K extends keyof AgentConfig>(k: K, v: AgentConfig[K] | undefined) => { if (v !== undefined) o[k] = v; };
  set('name', i.agentName); set('agentRole', i.agentRole); set('businessName', i.businessName); set('industry', i.businessType); set('language', i.language);
  set('tone', i.tone); set('personality', i.personality); set('model', i.model); set('temperature', i.temperature); set('instructions', i.systemPrompt);
  set('greeting', i.greeting); set('salesFlow', i.salesFlow); set('restrictions', i.restrictions); set('enabled', i.isAiActive);
  set('handoffKeywords', i.handoffKeywords); set('handoffMessage', i.handoffMessage); set('hours', i.hours); set('outOfHoursMessage', i.outOfHoursMessage);
  if (i.faqItems !== undefined) o.faq = i.faqItems; else if (i.faq !== undefined) o.faq = parseFaq(i.faq);
  return o;
}
