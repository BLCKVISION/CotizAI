import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InboxService } from '../agent/inbox.service.js';
import { AutomationRule, Appointment, Contact, WaTemplate } from './entities.js';
import { EventsService } from './events.service.js';
import { SettingsService } from './settings.service.js';

const MINUTE = 60_000;

/**
 * Motor de automatizaciones y tareas programadas:
 *  - reglas del funnel (inactividad, cita creada, cambio de estado)
 *  - recordatorios de citas (24 h y 2 h antes) por WhatsApp
 *  - actualización diaria de la tasa BCV
 * Cada ejecución se "reclama" en la base de datos (índice único / UPDATE condicional),
 * así que no se duplican envíos aunque haya varias instancias.
 */
@Injectable()
export class AutomationsService implements OnModuleInit, OnModuleDestroy {
  private log = new Logger('Automations');
  private timers: NodeJS.Timeout[] = [];
  private busy = new Set<string>();

  constructor(
    @InjectRepository(AutomationRule) private rules: Repository<AutomationRule>,
    @InjectRepository(Contact) private contacts: Repository<Contact>,
    @InjectRepository(Appointment) private appts: Repository<Appointment>,
    @InjectRepository(WaTemplate) private templates: Repository<WaTemplate>,
    private inbox: InboxService,
    private events: EventsService,
    private settings: SettingsService,
    private config: ConfigService,
  ) {}

  private get tz() { return this.config.get<string>('AGENT_TIMEZONE') || 'Europe/Madrid'; }

  onModuleInit() {
    this.events.bus.on('event', (e: { userId: string; event: string; data: unknown }) => void this.onEvent(e).catch(err => this.log.error((err as Error).stack)));
    if (this.config.get('SCHEDULER') === 'off') return;
    const every = (name: string, ms: number, fn: () => Promise<void>) => {
      const run = async () => {
        if (this.busy.has(name)) return;
        this.busy.add(name);
        try { await fn(); } catch (e) { this.log.error(`${name}: ${(e as Error).message}`); } finally { this.busy.delete(name); }
      };
      this.timers.push(setInterval(run, ms).unref());
      setTimeout(run, 5_000).unref();
    };
    const tick = Number(this.config.get('SCHEDULER_TICK_MS')) || 0; // solo para pruebas: fuerza un intervalo corto
    every('inactividad', tick || 10 * MINUTE, () => this.runInactivity());
    every('recordatorios', tick || 5 * MINUTE, () => this.runReminders());
    every('bcv', tick || 6 * 60 * MINUTE, () => this.settings.refreshAuto());
  }

  onModuleDestroy() { this.timers.forEach(clearInterval); }

  // ── Reglas basadas en eventos ───────────────────────────────────────────────
  private async onEvent({ userId, event, data }: { userId: string; event: string; data: unknown }) {
    if (event !== 'appointment.created' && event !== 'contact.status_changed') return;
    const trigger = event === 'appointment.created' ? 'appointment_created' : 'status_changed';
    const rules = await this.rules.findBy({ userId, trigger, active: true });
    if (!rules.length) return;
    if (event === 'appointment.created') {
      const a = data as Appointment;
      if (!a.contactId) return;
      const contact = await this.contacts.findOneBy({ id: a.contactId, userId });
      if (!contact) return;
      for (const r of rules) await this.apply(r, contact, `appt:${a.id}`);
    } else {
      const { contact, to } = data as { contact: Contact; to: string };
      for (const r of rules) if (!r.conditions.toStatus || r.conditions.toStatus === to) await this.apply(r, contact, `status:${to}:${Math.floor(Date.now() / (10 * MINUTE))}`);
    }
  }

  // ── Inactividad: nuestro último mensaje (humano o IA, no automático) sin respuesta del cliente.
  // Los mensajes automáticos no cuentan: así un seguimiento no genera otro seguimiento en bucle. ───────────
  async runInactivity() {
    const rules = await this.rules.findBy({ trigger: 'inactivity', active: true });
    for (const r of rules) {
      const hours = Math.max(1, Number(r.conditions.waitHours) || 24);
      const due: { id: string; messageId: string }[] = await this.contacts.query(
        `SELECT c.id, l.id AS "messageId" FROM contacts c
         JOIN LATERAL (SELECT id, direction, sender, "createdAt" FROM messages m WHERE m."contactId" = c.id ORDER BY "createdAt" DESC LIMIT 1) l ON true
         WHERE c."userId" = $1 AND c."needsHuman" = false AND ($2::text IS NULL OR c.status = $2)
           AND l.direction = 'out' AND l.sender <> 'auto' AND l."createdAt" < now() - make_interval(hours => $3) LIMIT 200`,
        [r.userId, r.conditions.status ?? null, hours],
      );
      for (const d of due) {
        const contact = await this.contacts.findOneBy({ id: d.id, userId: r.userId });
        if (contact) await this.apply(r, contact, `msg:${d.messageId}`);
      }
    }
  }

  /** Ejecuta las acciones de una regla una sola vez por (regla, cliente, referencia). */
  private async apply(rule: AutomationRule, contact: Contact, ref: string) {
    const claimed: unknown[] = await this.rules.manager.query(
      `INSERT INTO automation_runs ("ruleId", "contactId", ref) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING id`,
      [rule.id, contact.id, ref],
    );
    if (!claimed.length) return;
    const { sendText, moveStatus } = rule.actions;
    if (moveStatus && moveStatus !== contact.status) { contact.status = moveStatus; await this.contacts.save(contact); this.events.emit(rule.userId, 'contact.updated', contact); }
    // Texto libre, o el cuerpo de la plantilla propia indicada por nombre (API v1: sendTemplate).
    const text = sendText?.trim() || (rule.templateName ? (await this.templates.findOneBy({ userId: rule.userId, name: rule.templateName }))?.body : '');
    if (text?.trim()) await this.inbox.sendAutomated(rule.userId, contact, this.fill(text, contact));
    await this.rules.update(rule.id, { runs: () => 'runs + 1', lastRunAt: new Date() });
    this.log.log(`Regla "${rule.name}" aplicada a ${contact.id}`);
  }

  private fill = (t: string, c: Contact) => t.replace(/\{\{\s*nombre\s*\}\}/gi, c.name.split(' ')[0] ?? '');

  // ── Recordatorios de citas ──────────────────────────────────────────────────
  async runReminders() {
    const when = (d: Date) => new Intl.DateTimeFormat('es', { timeZone: this.tz, dateStyle: 'full', timeStyle: 'short' }).format(d);
    for (const [flag, minHours, maxHours, label] of [['reminder24hSent', 3, 24, 'mañana'], ['reminder2hSent', 0, 2, 'en unas horas']] as const) {
      // UPDATE ... RETURNING reclama la cita: si otra instancia ya la tomó, no devuelve nada.
      const res: unknown = await this.appts.query(
        `UPDATE appointments SET "${flag}" = true
         WHERE "${flag}" = false AND status IN ('pendiente','confirmada') AND "contactId" IS NOT NULL
           AND "startsAt" > now() + make_interval(hours => $1) AND "startsAt" <= now() + make_interval(hours => $2)
         RETURNING *`,
        [minHours, maxHours],
      );
      // El driver de Postgres devuelve [filas, contador] en los UPDATE.
      const rows = (Array.isArray(res) && Array.isArray(res[0]) ? res[0] : res) as Appointment[];
      // El de 24 h se omite si la cita es en menos de 3 h (el de 2 h ya cubrirá esa ventana).
      for (const raw of rows) {
        const a = { ...raw, startsAt: new Date(raw.startsAt) } as Appointment;
        const contact = await this.contacts.findOneBy({ id: a.contactId!, userId: a.userId });
        if (!contact) continue;
        await this.inbox.sendAutomated(a.userId, contact, `Hola ${contact.name.split(' ')[0]}, te recordamos tu cita "${a.title}" ${label}: ${when(a.startsAt)}. Si no puedes asistir, avísanos por aquí.`);
      }
    }
  }
}
