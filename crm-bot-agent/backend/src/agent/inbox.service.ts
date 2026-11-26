import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentConfig, Contact, Message } from '../crm/entities.js';
import { EventsService } from '../crm/events.service.js';
import { WhatsappService } from '../whatsapp/whatsapp.service.js';
import { AgentEngine } from './agent.engine.js';
import { AgentUnavailable } from './llm.service.js';

/** Tras responder una persona, la IA no contesta durante este tiempo (o hasta resume-bot). */
export const HUMAN_PAUSE_MS = 30 * 60_000;

export interface InboxResult { message: Message; reply: Message | null; warning?: string }

/** Punto único de entrada/salida de mensajes: guarda, dispara webhooks, ejecuta el agente y envía por WhatsApp. */
@Injectable()
export class InboxService {
  private log = new Logger('Inbox');
  constructor(
    @InjectRepository(Message) private msgs: Repository<Message>,
    @InjectRepository(Contact) private contacts: Repository<Contact>,
    @InjectRepository(AgentConfig) private agents: Repository<AgentConfig>,
    private engine: AgentEngine,
    private events: EventsService,
    private wa: WhatsappService,
  ) {}

  /** Mensaje del cliente → guarda y, si corresponde, el agente responde (y se envía por WhatsApp). */
  async receive(userId: string, contact: Contact, body: string, externalId: string | null = null): Promise<InboxResult> {
    const message = await this.msgs.save(this.msgs.create({ userId, contactId: contact.id, direction: 'in', sender: 'client', body: body.slice(0, 4000), externalId }));
    if (contact.resolved) { contact.resolved = false; await this.contacts.update({ id: contact.id }, { resolved: false }); } // un mensaje nuevo reabre la conversación
    this.events.emit(userId, 'message.received', { contact, message });
    let reply: Message | null = null;
    let warning: string | undefined;
    const auto = await this.preChecks(userId, contact, body);
    if (auto) {
      reply = await this.msgs.save(this.msgs.create({ userId, contactId: contact.id, direction: 'out', sender: 'ai', body: auto, externalId: null }));
      this.events.emit(userId, 'message.sent', { contact, message: reply });
      await this.deliver(userId, contact, auto);
      return { message, reply };
    }
    try {
      const r = await this.engine.respond(userId, contact.id);
      reply = r.reply; warning = r.skipped;
    } catch (e) {
      if (!(e instanceof AgentUnavailable)) this.log.error((e as Error).stack);
      warning = (e as Error).message;
    }
    if (reply) await this.deliver(userId, contact, reply.body);
    return { message, reply, warning };
  }

  /** Mensaje de una persona del equipo: se guarda, pausa la derivación y se envía por WhatsApp. */
  async sendHuman(userId: string, contact: Contact, body: string) {
    const message = await this.msgs.save(this.msgs.create({ userId, contactId: contact.id, direction: 'out', sender: 'human', body: body.slice(0, 4000), externalId: null }));
    contact.needsHuman = false;
    contact.botPausedUntil = new Date(Date.now() + HUMAN_PAUSE_MS); // el bot calla mientras el equipo atiende
    contact.lastReadAt = new Date();
    const from = contact.status;
    if (contact.status === 'nuevo') contact.status = 'contactado';
    await this.contacts.save(contact);
    if (contact.status !== from) this.events.statusChanged(userId, contact, from, contact.status);
    this.events.emit(userId, 'message.sent', { contact, message });
    await this.deliver(userId, contact, body);
    return message;
  }

  /**
   * Reglas deterministas previas al modelo: palabras de derivación y horario de atención.
   * Devuelve el texto a responder, o null para que responda el agente.
   */
  private async preChecks(userId: string, contact: Contact, body: string): Promise<string | null> {
    const a = await this.agents.findOneBy({ userId });
    if (!a?.configured || !a.enabled || contact.needsHuman || (contact.botPausedUntil && +contact.botPausedUntil > Date.now())) return null;
    const text = body.toLowerCase();
    if (a.handoffKeywords?.some(k => k.trim() && text.includes(k.trim().toLowerCase()))) {
      contact.needsHuman = true;
      await this.contacts.save(contact);
      this.events.emit(userId, 'contact.updated', contact);
      this.events.emit(userId, 'handoff', { contact, reason: 'palabra clave de derivación' });
      return a.handoffMessage || 'Te paso con una persona del equipo para que te atienda enseguida.';
    }
    if (a.hours?.enabled && a.outOfHoursMessage && !this.inHours(a.hours)) {
      // Avisa una sola vez por franja: si ya avisamos en las últimas 6 h, deja pasar al agente.
      const recent = await this.msgs.query(`SELECT 1 FROM messages WHERE "userId"=$1 AND "contactId"=$2 AND direction='out' AND body=$3 AND "createdAt" > now() - interval '6 hours' LIMIT 1`, [userId, contact.id, a.outOfHoursMessage]);
      if (!recent.length) return a.outOfHoursMessage;
    }
    return null;
  }

  private inHours(h: { days: number[]; start: string; end: string }) {
    const tz = process.env['AGENT_TIMEZONE'] || 'Europe/Madrid';
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
    const now = `${get('hour')}:${get('minute')}`;
    return h.days.includes(day) && now >= h.start && now < h.end;
  }

  /** Mensaje automático (recordatorio o regla del funnel): se guarda como mensaje saliente y se envía por WhatsApp. */
  async sendAutomated(userId: string, contact: Contact, body: string) {
    const message = await this.msgs.save(this.msgs.create({ userId, contactId: contact.id, direction: 'out', sender: 'auto', body: body.slice(0, 4000), externalId: null }));
    this.events.emit(userId, 'message.sent', { contact, message });
    await this.deliver(userId, contact, body);
    return message;
  }

  private async deliver(userId: string, contact: Contact, body: string) {
    const acc = await this.wa.find(userId);
    if (acc && contact.phone) await this.wa.sendText(acc, contact.phone, body);
  }
}
