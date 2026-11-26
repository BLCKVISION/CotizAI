import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SettingsService } from '../crm/settings.service.js';
import { AgentConfig, Appointment, CONTACT_STATUSES, Contact, FunnelStep, KnowledgeDoc, Message, Product } from '../crm/entities.js';
import { EventsService } from '../crm/events.service.js';
import { AgentUnavailable, LlmMessage, LlmService, LlmTool } from './llm.service.js';
import { nowInZone, zonedToUtc } from './tz.js';

const MAX_TOOL_ROUNDS = 5;
const HISTORY = 30;

const TOOLS: LlmTool[] = [
  {
    name: 'schedule_appointment',
    description: 'Agenda una cita para el cliente. Úsala solo cuando el cliente haya confirmado día y hora. Hora local del negocio.',
    input_schema: { type: 'object', properties: { title: { type: 'string' }, start_local: { type: 'string', description: 'Formato YYYY-MM-DDTHH:mm, hora local del negocio' }, notes: { type: 'string' } }, required: ['title', 'start_local'] },
  },
  {
    name: 'update_contact',
    description: 'Actualiza la ficha del cliente: datos que te haya dado, su estado en el pipeline y un score de interés (0-100). Llámala cada vez que aprendas algo nuevo.',
    input_schema: { type: 'object', properties: { name: { type: 'string' }, email: { type: 'string' }, status: { type: 'string', enum: [...CONTACT_STATUSES] }, score: { type: 'integer', minimum: 0, maximum: 100 }, captured: { type: 'object', additionalProperties: { type: 'string' }, description: 'Datos capturados (p. ej. presupuesto, zona)' } } },
  },
  {
    name: 'advance_funnel_step',
    description: 'Pasa al siguiente paso del funnel. SOLO si se cumplen los criterios de transición del paso actual.',
    input_schema: { type: 'object', properties: { reason: { type: 'string' } }, required: ['reason'] },
  },
  {
    name: 'handoff_to_human',
    description: 'Deriva la conversación a una persona: el cliente lo pide, hay una queja, o no puedes resolver con la información disponible. Después de llamarla, avisa al cliente.',
    input_schema: { type: 'object', properties: { reason: { type: 'string' } }, required: ['reason'] },
  },
];

const stop = new Set('de la que el en y a los se del las un por con no una su para es al lo como mas pero sus le ya o este si porque esta entre cuando muy sin sobre tambien me hasta hay donde quien desde todo nos durante todos uno les ni contra otros ese eso ante ellos e esto mi antes algunos que unos yo otro otras otra el tanto esa estos mucho quienes nada muchos cual poco ella estar estas algunas algo nosotros hola quiero'.split(' '));
export const tokens = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\W+/).filter(w => w.length > 2 && !stop.has(w)).map(w => w.slice(0, 5)); // prefijo ≈ raíz (visita/visitas)

export function topDocs(docs: KnowledgeDoc[], query: string, n = 3) {
  const q = tokens(query);
  if (!q.length) return [];
  return docs
    .map(d => { const t = new Set(tokens(`${d.title} ${d.title} ${d.content}`)); return { d, score: q.filter(w => t.has(w)).length }; })
    .filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, n).map(x => x.d);
}

export interface EngineResult { reply: Message | null; skipped?: string }

@Injectable()
export class AgentEngine {
  private log = new Logger('Agent');
  constructor(
    private llm: LlmService,
    private config: ConfigService,
    private events: EventsService,
    private settings: SettingsService,
    @InjectRepository(AgentConfig) private agents: Repository<AgentConfig>,
    @InjectRepository(Contact) private contacts: Repository<Contact>,
    @InjectRepository(Message) private msgs: Repository<Message>,
    @InjectRepository(Appointment) private appts: Repository<Appointment>,
    @InjectRepository(Product) private products: Repository<Product>,
    @InjectRepository(KnowledgeDoc) private docs: Repository<KnowledgeDoc>,
    @InjectRepository(FunnelStep) private funnel: Repository<FunnelStep>,
  ) {}

  private get tz() { return this.config.get<string>('AGENT_TIMEZONE') || 'Europe/Madrid'; }

  /** Responde al último mensaje del cliente. Lanza AgentUnavailable si no hay modelo disponible. */
  async respond(userId: string, contactId: string): Promise<EngineResult> {
    const agent = await this.agents.findOneBy({ userId });
    if (!agent?.configured) return { reply: null, skipped: 'Agente sin configurar' };
    if (!agent.enabled) return { reply: null, skipped: 'Agente desactivado' };
    let contact = await this.contacts.findOneByOrFail({ id: contactId, userId });
    if (contact.needsHuman) return { reply: null, skipped: 'Conversación en manos de un humano' };
    if (contact.botPausedUntil && +contact.botPausedUntil > Date.now()) return { reply: null, skipped: 'Un humano pausó la IA en esta conversación' };

    const [history, steps, products, docs, appts] = await Promise.all([
      this.msgs.find({ where: { userId, contactId }, order: { createdAt: 'DESC' }, take: HISTORY }),
      this.funnel.find({ where: { userId }, order: { position: 'ASC' } }),
      this.products.findBy({ userId, active: true }),
      this.docs.findBy({ userId }),
      this.appts.findBy({ userId, contactId }),
    ]);
    history.reverse();
    const lastIncoming = [...history].reverse().find(m => m.direction === 'in');
    if (!lastIncoming) return { reply: null, skipped: 'Sin mensaje del cliente' };

    const rate = await this.settings.rate(userId);
    const system = this.buildSystem(agent, contact, steps, products, rate, topDocs(docs, history.filter(m => m.direction === 'in').slice(-3).map(m => m.body).join(' ')), appts);
    const messages = this.toLlmMessages(history);
    let text = '';
    const state = { contact };

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const res = await this.llm.complete(system, messages, TOOLS, { temperature: agent.temperature !== 0.7 ? agent.temperature : undefined });
      text = res.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('\n').trim();
      const uses = res.content.filter(b => b.type === 'tool_use');
      if (res.stop_reason !== 'tool_use' || !uses.length) break;
      messages.push({ role: 'assistant', content: res.content });
      const results = [];
      for (const u of uses) {
        const out = await this.runTool(userId, state, steps, u.name, u.input as Record<string, unknown>).catch(e => `Error: ${(e as Error).message}`);
        results.push({ type: 'tool_result' as const, tool_use_id: u.id, content: out });
      }
      messages.push({ role: 'user', content: results });
      text = '';
    }
    if (!text) return { reply: null, skipped: 'El modelo no generó respuesta' };

    const reply = await this.msgs.save(this.msgs.create({ userId, contactId, direction: 'out', sender: 'ai', body: text, externalId: null }));
    contact = await this.contacts.findOneByOrFail({ id: contactId });
    this.events.emit(userId, 'message.sent', { contact, message: reply });
    return { reply };
  }

  /** Prueba del agente desde el panel: una sola respuesta con la configuración real, sin guardar nada ni ejecutar herramientas. */
  async preview(userId: string, text: string) {
    const agent = await this.agents.findOneBy({ userId });
    if (!agent) throw new AgentUnavailable('Configura primero el agente');
    const [steps, products, docs, rate] = await Promise.all([this.funnel.find({ where: { userId }, order: { position: 'ASC' } }), this.products.findBy({ userId, active: true }), this.docs.findBy({ userId }), this.settings.rate(userId)]);
    const demo = Object.assign(new Contact(), { id: 'preview', name: 'Cliente de prueba', status: 'nuevo', score: 0, data: {}, funnelStep: 0, needsHuman: false });
    const system = this.buildSystem(agent, demo, steps, products, rate, topDocs(docs, text), []) + '\n\n(Modo de prueba: responde solo con texto, sin usar herramientas.)';
    const res = await this.llm.complete(system, [{ role: 'user', content: text }], [], { temperature: agent.temperature !== 0.7 ? agent.temperature : undefined });
    return res.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('\n').trim();
  }

  private buildSystem(a: AgentConfig, c: Contact, steps: FunnelStep[], products: Product[], rate: number | null, docs: KnowledgeDoc[], appts: Appointment[]) {
    const step = steps[Math.min(c.funnelStep, steps.length - 1)];
    const parts = [
      `Eres ${a.name || 'el asistente'}${a.agentRole ? `, ${a.agentRole}` : ''}, agente virtual de ${a.businessName || 'la empresa'}${a.industry ? ` (${a.industry})` : ''}, atendiendo por WhatsApp. Tono: ${a.tone}.${a.personality ? ` Personalidad: ${a.personality}.` : ''}`,
      a.instructions && `## Instrucciones del negocio\n${a.instructions}`,
      a.salesFlow && `## Flujo de ventas del negocio\n${a.salesFlow}`,
      a.greeting && `Si es el primer mensaje, saluda con algo como: "${a.greeting}"`,
      `## Reglas\n- Mensajes cortos y naturales, propios de WhatsApp. Un solo tema por mensaje; no hagas más de una pregunta a la vez.\n- Usa SOLO la información de este prompt (catálogo y documentos). Si no la tienes, dilo y ofrece derivar a una persona; no inventes precios, horarios ni disponibilidad.\n- Responde siempre en el idioma del cliente.\n- Usa las herramientas para actuar: guarda los datos que el cliente te dé con update_contact, agenda con schedule_appointment solo tras confirmación explícita, y usa handoff_to_human si lo pide, se queja o no puedes ayudar.`,
      `## Fecha y hora actual (zona del negocio: ${this.tz})\n${nowInZone(this.tz)}`,
      `## Cliente\nNombre: ${c.name}\nEstado: ${c.status}\nScore: ${c.score}\nDatos capturados: ${JSON.stringify(c.data ?? {})}\nCitas: ${appts.length ? appts.map(x => `${x.title} el ${x.startsAt.toISOString()} (${x.status})`).join('; ') : 'ninguna'}`,
    ];
    if (steps.length && step) {
      parts.push(`## Funnel de ventas — paso ${Math.min(c.funnelStep, steps.length - 1) + 1} de ${steps.length}: ${step.name}\nPrompt del paso: ${step.prompt}\nObjetivos a capturar (en orden): ${step.objectives || '—'}\nCriterios para avanzar: ${step.criteria || '—'}\nSi el cliente se adelanta a otro tema, atiéndelo brevemente y redirige al paso actual. Llama a advance_funnel_step SOLO cuando se cumplan los criterios.${c.funnelStep < steps.length - 1 ? ` Siguiente paso: ${steps[c.funnelStep + 1].name}.` : ' Es el último paso.'}`);
    }
    if (a.restrictions) parts.push(`## Restricciones (nunca hacer ni decir)\n${a.restrictions}`);
    if (a.faq?.length) parts.push(`## Preguntas frecuentes (responde con estas respuestas)\n${a.faq.map(f => `P: ${f.question}\nR: ${f.answer}`).join('\n')}`);
    // Inventario: lo agotado no se ofrece; el resto indica unidades disponibles.
    const sellable = products.filter(p => !p.trackStock || p.stock > 0);
    const soldOut = products.filter(p => p.trackStock && p.stock <= 0);
    if (products.length) parts.push(`## Catálogo${rate ? ` (precios en USD; tasa BCV: ${rate} Bs por USD, para pagos en bolívares)` : ''}\n${sellable.map(p => `- ${p.name}${p.sku ? ` (SKU ${p.sku})` : ''} — ${p.price}${rate ? ` USD ≈ ${(p.price * rate).toFixed(2)} Bs` : ''}${p.trackStock ? ` · ${p.stock} disponibles` : ''}${p.category ? ` [${p.category}]` : ''}${p.description ? `: ${p.description}` : ''}`).join('\n')}${soldOut.length ? `\nAGOTADOS (no los ofrezcas, informa que no hay stock): ${soldOut.map(p => p.name).join(', ')}` : ''}`);
    if (docs.length) parts.push(`## Base de conocimiento (documentos relevantes)\n${docs.map((d, i) => `[${i + 1}] ${d.title}\n${d.content.slice(0, 1500)}`).join('\n\n')}\nCuando uses un documento, menciona de dónde sale la información.`);
    return parts.filter(Boolean).join('\n\n');
  }

  /** La API exige turnos alternados que empiecen por el usuario. */
  private toLlmMessages(history: Message[]): LlmMessage[] {
    const out: { role: 'user' | 'assistant'; content: string }[] = [];
    for (const m of history) {
      const role = m.direction === 'in' ? 'user' : 'assistant';
      const last = out[out.length - 1];
      if (last?.role === role) last.content += '\n' + m.body;
      else out.push({ role, content: m.body });
    }
    while (out.length && out[0].role !== 'user') out.shift();
    return out;
  }

  private async runTool(userId: string, state: { contact: Contact }, steps: FunnelStep[], name: string, input: Record<string, unknown>): Promise<string> {
    const c = (state.contact = await this.contacts.findOneByOrFail({ id: state.contact.id }));
    switch (name) {
      case 'schedule_appointment': {
        const when = zonedToUtc(String(input['start_local']), this.tz);
        if (!when) return 'Error: start_local inválido, usa YYYY-MM-DDTHH:mm';
        if (+when < Date.now()) return 'Error: la fecha ya pasó';
        const clash = await this.appts.findOneBy({ userId, startsAt: when });
        if (clash && clash.status !== 'cancelada') return 'Error: ese horario ya está ocupado, propón otro';
        const a = await this.appts.save(this.appts.create({ userId, contactId: c.id, title: String(input['title']), startsAt: when, notes: String(input['notes'] ?? ''), status: 'pendiente', createdBy: 'ai' }));
        this.events.emit(userId, 'appointment.created', a);
        return `Cita agendada para ${when.toISOString()}`;
      }
      case 'update_contact': {
        if (typeof input['name'] === 'string' && input['name']) c.name = input['name'];
        if (typeof input['email'] === 'string') c.email = input['email'];
        const prevStatus = c.status;
        if (typeof input['status'] === 'string' && (CONTACT_STATUSES as readonly string[]).includes(input['status'])) c.status = input['status'];
        if (typeof input['score'] === 'number') c.score = Math.max(0, Math.min(100, Math.round(input['score'])));
        if (input['captured'] && typeof input['captured'] === 'object') c.data = { ...c.data, ...(input['captured'] as Record<string, string>) };
        await this.contacts.save(c);
        this.events.emit(userId, 'contact.updated', c);
        if (c.status !== prevStatus) this.events.statusChanged(userId, c, prevStatus, c.status);
        return 'Ficha actualizada';
      }
      case 'advance_funnel_step': {
        if (c.funnelStep >= steps.length - 1) return 'Ya estás en el último paso';
        c.funnelStep++;
        await this.contacts.save(c);
        return `Ahora estás en el paso ${c.funnelStep + 1}: ${steps[c.funnelStep].name}. Prompt: ${steps[c.funnelStep].prompt}`;
      }
      case 'handoff_to_human': {
        c.needsHuman = true;
        await this.contacts.save(c);
        this.events.emit(userId, 'contact.updated', c);
        this.events.emit(userId, 'handoff', { contact: c, reason: String(input['reason'] ?? '') });
        this.log.log(`Derivado a humano (${c.id}): ${String(input['reason'])}`);
        return 'Conversación derivada; un humano continuará. Avisa al cliente.';
      }
      default:
        return `Herramienta desconocida: ${name}`;
    }
  }
}

export { AgentUnavailable };
