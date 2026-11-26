import { randomBytes } from 'node:crypto';
import { BadRequestException, Inject, Body, Controller, Get, Header, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtGuard } from '../auth/jwt.guard.js';
import { crudController } from './crud.js';
import { assertPublicUrl } from '../common/ssrf.js';
import { AgentConfigDto, AppointmentDto, AutomationDto, BcvDto, ContactDto, FunnelStepDto, ImportRowsDto, KnowledgeDto, ProductCreateDto, ProductUpdateDto, SendMessageDto, StockMovementDto, TemplateDto, WebhookDto } from './dto.js';
import { Appointment, AutomationRule, Contact, FunnelStep, KnowledgeDoc, Message, Product, StockMovement, WaTemplate, Webhook, AgentConfig } from './entities.js';
import { SettingsService } from './settings.service.js';
import { InventoryService } from './inventory.service.js';
import { EventsService, WEBHOOK_EVENTS } from './events.service.js';
import { InboxService } from '../agent/inbox.service.js';
import { FUNNEL_TEMPLATES, AGENT_PRESETS } from './presets.js';

type Req_ = { userId: string };

@Controller('contacts')
export class ContactsController extends crudController('contacts', Contact, { create: ContactDto, events: { created: 'contact.created', updated: 'contact.updated' } }) {
  @Patch(':id') @UseGuards(JwtGuard)
  override async update(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string, @Body(new ValidationPipe({ whitelist: true, transform: true, expectedType: ContactDto, skipMissingProperties: true })) body: Record<string, unknown>) {
    const before = await this.repo.findOneBy({ id, userId: r.userId });
    const row = await super.update(r, id, body);
    if (before && row.status !== before.status) this.events.statusChanged(r.userId, row, before.status, row.status);
    return row;
  }

  @Post('import') @UseGuards(JwtGuard) @HttpCode(200)
  async import(@Req() r: Req_, @Body(new ValidationPipe({ whitelist: true, transform: true })) body: ImportRowsDto) {
    const saved = await this.repo.save(body.rows.map(x => this.repo.create({ name: x.name, phone: x.phone ?? '', email: x.email ?? '', source: 'importado', userId: r.userId })));
    return { imported: saved.length };
  }

  @Get('export') @UseGuards(JwtGuard) @Header('Content-Type', 'text/csv; charset=utf-8')
  async export(@Req() r: Req_) {
    const list = await this.repo.find({ where: { userId: r.userId }, order: { createdAt: 'DESC' } });
    const esc = (v: unknown) => { const t = String(v ?? ''); return `"${(/^[=+\-@\t\r]/.test(t) ? "'" + t : t).replace(/"/g, '""')}"`; }; // evita inyección de fórmulas en Excel
    return ['nombre,telefono,email,estado,score,fuente', ...list.map(c => [c.name, c.phone, c.email, c.status, c.score, c.source].map(esc).join(','))].join('\n');
  }
}

@Controller('appointments')
export class AppointmentsController extends crudController('appointments', Appointment, { create: AppointmentDto, order: { startsAt: 'ASC' }, events: { created: 'appointment.created', updated: 'appointment.updated' } }) {
  /** Si se reprograma, los recordatorios vuelven a estar pendientes. */
  @Patch(':id') @UseGuards(JwtGuard)
  override async update(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string, @Body(new ValidationPipe({ whitelist: true, transform: true, expectedType: AppointmentDto, skipMissingProperties: true })) body: Record<string, unknown>) {
    return super.update(r, id, body['startsAt'] ? { ...body, reminder24hSent: false, reminder2hSent: false } : body);
  }
}

@Controller('products')
export class ProductsController extends crudController('products', Product, { create: ProductCreateDto, update: ProductUpdateDto }) {
  @Inject(InventoryService) private inventory!: InventoryService;

  /** Alta con stock inicial: queda registrado como primer movimiento del inventario. */
  @Post() @UseGuards(JwtGuard)
  override async create(@Req() r: Req_, @Body(new ValidationPipe({ whitelist: true, transform: true, expectedType: ProductCreateDto })) body: Record<string, unknown>) {
    const sku = String(body['sku'] ?? '').trim();
    if (sku && (await this.repo.existsBy({ userId: r.userId, sku }))) throw new BadRequestException('Ya existe un producto con ese SKU');
    const row = await this.repo.save(this.repo.create({ ...body, sku, userId: r.userId }));
    if (row.trackStock && row.stock > 0) await this.repo.manager.save(StockMovement, this.repo.manager.create(StockMovement, { userId: r.userId, productId: row.id, type: 'in', quantity: row.stock, stockBefore: 0, stockAfter: row.stock, reason: 'Stock inicial' }));
    return row;
  }

  @Patch(':id') @UseGuards(JwtGuard)
  override async update(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string, @Body(new ValidationPipe({ whitelist: true, transform: true, expectedType: ProductUpdateDto, skipMissingProperties: true })) body: Record<string, unknown>) {
    const sku = typeof body['sku'] === 'string' ? body['sku'].trim() : undefined;
    const taken = sku ? await this.repo.findOneBy({ userId: r.userId, sku }) : null;
    if (taken && taken.id !== id) throw new BadRequestException('Ya existe un producto con ese SKU');
    return super.update(r, id, sku === undefined ? body : { ...body, sku });
  }

  /** Resumen del inventario: valor a costo y a precio de venta, y productos con stock bajo o agotados. */
  @Get('inventory/summary') @UseGuards(JwtGuard)
  async summary(@Req() r: Req_) {
    const list = await this.repo.findBy({ userId: r.userId });
    const tracked = list.filter(p => p.trackStock);
    return {
      products: list.length, tracked: tracked.length, units: tracked.reduce((s, p) => s + p.stock, 0),
      costValue: round2(tracked.reduce((s, p) => s + p.stock * p.cost, 0)), retailValue: round2(tracked.reduce((s, p) => s + p.stock * p.price, 0)),
      outOfStock: tracked.filter(p => p.stock <= 0).length, lowStock: tracked.filter(p => p.stock > 0 && p.stock <= p.minStock).length,
    };
  }

  @Get(':id/movements') @UseGuards(JwtGuard)
  async movements(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string) {
    return this.repo.manager.find(StockMovement, { where: { userId: r.userId, productId: id }, order: { createdAt: 'DESC' }, take: 100 });
  }

  /** Entrada, salida o ajuste de stock. Transaccional y con bloqueo de fila para evitar carreras. */
  @Post(':id/stock') @UseGuards(JwtGuard) @HttpCode(200)
  stock(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string, @Body(new ValidationPipe({ whitelist: true, transform: true })) dto: StockMovementDto) {
    return this.inventory.move(r.userId, id, dto.type, dto.quantity, dto.reason);
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export const KnowledgeController = crudController('knowledge', KnowledgeDoc, { create: KnowledgeDto });
export const TemplatesController = crudController('templates', WaTemplate, { create: TemplateDto });

@Controller('automations')
export class AutomationsController extends crudController('automations', AutomationRule, { create: AutomationDto }) {}

@Controller('settings')
@UseGuards(JwtGuard)
export class SettingsController {
  constructor(private settings: SettingsService) {}

  @Get('bcv') bcv(@Req() r: Req_) { return this.settings.bcv(r.userId); }

  @Put('bcv') save(@Req() r: Req_, @Body(new ValidationPipe({ whitelist: true, transform: true })) dto: BcvDto) { return this.settings.saveBcv(r.userId, dto); }

  /** Consulta la tasa oficial publicada y la guarda. */
  @Post('bcv/refresh') @HttpCode(200) refresh(@Req() r: Req_) { return this.settings.refreshBcv(r.userId); }
}

@Controller('funnel')
export class FunnelController extends crudController('funnel', FunnelStep, { create: FunnelStepDto, order: { position: 'ASC' } }) {
  @Get('templates') @UseGuards(JwtGuard) templates() {
    return Object.entries(FUNNEL_TEMPLATES).map(([key, t]) => ({ key, name: t.name, steps: t.steps.length }));
  }

  @Post('apply-template/:key') @UseGuards(JwtGuard) @HttpCode(200)
  async apply(@Req() r: Req_, @Param('key') key: string) {
    const t = FUNNEL_TEMPLATES[key];
    if (!t) throw new NotFoundException('Plantilla no encontrada');
    await this.repo.delete({ userId: r.userId });
    return this.repo.save(t.steps.map((s, i) => this.repo.create({ ...s, position: i, userId: r.userId })));
  }
}

@Controller('webhooks')
export class WebhooksController extends crudController('webhooks', Webhook, { create: WebhookDto }) {
  @Get('events') @UseGuards(JwtGuard) eventList() { return WEBHOOK_EVENTS; }

  @Patch(':id') @UseGuards(JwtGuard)
  override async update(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string, @Body(new ValidationPipe({ whitelist: true, transform: true, expectedType: WebhookDto, skipMissingProperties: true })) body: Record<string, unknown>) {
    if (typeof body['url'] === 'string') await assertPublicUrl(body['url']);
    return super.update(r, id, body);
  }

  @Post() @UseGuards(JwtGuard)
  override async create(@Req() r: Req_, @Body(new ValidationPipe({ whitelist: true, transform: true, expectedType: WebhookDto })) body: WebhookDto & Record<string, unknown>) {
    await assertPublicUrl(body.url);
    const events = body.events?.length ? body.events.filter(e => WEBHOOK_EVENTS.includes(e)) : WEBHOOK_EVENTS;
    return this.repo.save(this.repo.create({ url: body.url, name: body.name ?? '', events, secret: 'whsec_' + randomBytes(24).toString('hex'), userId: r.userId }));
  }

  @Post(':id/test') @UseGuards(JwtGuard) @HttpCode(200)
  async test(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string) {
    const h = await this.repo.findOneBy({ id, userId: r.userId });
    if (!h) throw new NotFoundException();
    return { status: await this.events.deliver(h, 'webhook.test', { message: 'Evento de prueba' }) };
  }
}

@Controller('agent')
@UseGuards(JwtGuard)
export class AgentController {
  constructor(@InjectRepository(AgentConfig) private repo: Repository<AgentConfig>) {}

  @Get() async get(@Req() r: Req_) {
    return (await this.repo.findOneBy({ userId: r.userId })) ?? this.repo.save(this.repo.create({ userId: r.userId }));
  }

  @Get('presets') presets() { return AGENT_PRESETS; }

  @Put() async save(@Req() r: Req_, @Body(new ValidationPipe({ whitelist: true, transform: true })) body: AgentConfigDto) {
    const cur = await this.get(r);
    Object.assign(cur, JSON.parse(JSON.stringify(body)), { configured: true });
    return this.repo.save(cur);
  }
}

@Controller('conversations')
@UseGuards(JwtGuard)
export class ConversationsController {
  constructor(
    @InjectRepository(Message) private msgs: Repository<Message>,
    @InjectRepository(Contact) private contacts: Repository<Contact>,
    private inbox: InboxService,
  ) {}

  @Get() async list(@Req() r: Req_) {
    const last = await this.msgs.query(
      `SELECT DISTINCT ON ("contactId") "contactId", body, sender, "createdAt" FROM messages WHERE "userId" = $1 ORDER BY "contactId", "createdAt" DESC`,
      [r.userId],
    );
    const byId = new Map<string, { body: string; sender: string; createdAt: Date }>(last.map((m: { contactId: string; body: string; sender: string; createdAt: Date }) => [m.contactId, m]));
    const contacts = await this.contacts.findBy({ userId: r.userId });
    return contacts
      .filter(c => byId.has(c.id))
      .map(c => ({ contact: c, last: byId.get(c.id) }))
      .sort((a, b) => +new Date(b.last!.createdAt) - +new Date(a.last!.createdAt));
  }

  @Get(':contactId/messages') async messages(@Req() r: Req_, @Param('contactId', ParseUUIDPipe) contactId: string) {
    return this.msgs.find({ where: { userId: r.userId, contactId }, order: { createdAt: 'ASC' } });
  }

  /**
   * sender=client simula un mensaje entrante (mismo camino que el webhook de WhatsApp: el agente responde).
   * Cualquier otro sender es un mensaje de una persona del equipo.
   */
  @Post(':contactId/messages') async send(@Req() r: Req_, @Param('contactId', ParseUUIDPipe) contactId: string, @Body(new ValidationPipe({ whitelist: true, transform: true })) body: SendMessageDto) {
    const contact = await this.contacts.findOneBy({ id: contactId, userId: r.userId });
    if (!contact) throw new NotFoundException();
    const text = String(body.body ?? '').trim();
    if (!text) throw new BadRequestException('Mensaje vacío');
    if (body.sender === 'client') return this.inbox.receive(r.userId, contact, text);
    return { message: await this.inbox.sendHuman(r.userId, contact, text), reply: null };
  }
}

@Controller('stats')
@UseGuards(JwtGuard)
export class StatsController {
  constructor(
    @InjectRepository(Message) private msgs: Repository<Message>,
    @InjectRepository(Contact) private contacts: Repository<Contact>,
    @InjectRepository(Appointment) private appts: Repository<Appointment>,
    @InjectRepository(KnowledgeDoc) private docs: Repository<KnowledgeDoc>,
    @InjectRepository(Product) private products: Repository<Product>,
  ) {}

  private async load(userId: string, days: number) {
    const since = new Date(Date.now() - days * 86400_000);
    const [allContacts, msgs, appts] = await Promise.all([
      this.contacts.findBy({ userId }),
      this.msgs.createQueryBuilder('m').where('m.userId = :userId AND m.createdAt >= :since', { userId, since }).getMany(),
      this.appts.findBy({ userId }),
    ]);
    const contacts = allContacts.filter(c => c.createdAt >= since);
    return { since, allContacts, contacts, msgs, appts, apptsInRange: appts.filter(a => a.createdAt >= since) };
  }

  private series(days: number, items: { createdAt: Date }[]) {
    const out: { date: string; value: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
      out.push({ date: d, value: items.filter(x => x.createdAt.toISOString().slice(0, 10) === d).length });
    }
    return out;
  }

  private bySource(allContacts: Contact[]) {
    const m = new Map<string, { source: string; leads: number; closed: number }>();
    for (const c of allContacts) {
      const s = m.get(c.source) ?? { source: c.source, leads: 0, closed: 0 };
      s.leads++; if (c.status === 'cerrado') s.closed++;
      m.set(c.source, s);
    }
    return [...m.values()].sort((a, b) => b.leads - a.leads);
  }

  @Get('dashboard') async dashboard(@Req() r: Req_, @Query('days') d = '7') {
    const days = Math.min(Math.max(Number(d) || 7, 1), 365);
    const { allContacts, contacts, msgs, appts, apptsInRange } = await this.load(r.userId, days);
    const ai = msgs.filter(m => m.sender === 'ai'), human = msgs.filter(m => m.sender === 'human'), incoming = msgs.filter(m => m.direction === 'in');
    const now = Date.now(), endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);
    const weekEnd = now + 7 * 86400_000;
    const pending = appts.filter(a => a.status !== 'cancelada');
    const bot = ai.length + human.length;
    return {
      days,
      kpis: {
        aiMessages: ai.length, newLeads: contacts.length, totalLeads: allContacts.length,
        appointments: apptsInRange.length, appointmentsToday: pending.filter(a => +a.startsAt >= now && +a.startsAt <= endOfDay.getTime()).length,
        responseRate: incoming.length ? Math.min(100, Math.round(((ai.length + human.length) / incoming.length) * 100)) : 0, incoming: incoming.length,
      },
      activity: this.series(days, ai).map((p, i) => ({ date: p.date, ai: p.value, clients: this.series(days, incoming)[i].value })),
      pending: {
        interventions: allContacts.filter(c => c.needsHuman).length,
        appointmentsNext24h: pending.filter(a => +a.startsAt >= now && +a.startsAt <= now + 86400_000).length,
        appointmentsWeek: pending.filter(a => +a.startsAt >= now && +a.startsAt <= weekEnd).length,
        docs: await this.docs.countBy({ userId: r.userId }),
        lowStock: (await this.products.findBy({ userId: r.userId, trackStock: true, active: true })).filter(p => p.stock <= p.minStock).length,
      },
      pipeline: Object.entries(allContacts.reduce<Record<string, number>>((a, c) => ((a[c.status] = (a[c.status] ?? 0) + 1), a), {})).map(([status, count]) => ({ status, count })),
      bot: { ai: ai.length, human: human.length, automated: bot ? Math.round((ai.length / bot) * 100) : 0, clients: allContacts.length, interventions: allContacts.filter(c => c.needsHuman).length },
      sources: this.bySource(allContacts).slice(0, 5),
      recent: msgs.sort((a, b) => +b.createdAt - +a.createdAt).slice(0, 8).map(m => ({ id: m.id, contactId: m.contactId, sender: m.sender, body: m.body, createdAt: m.createdAt })),
    };
  }

  @Get('reports') async reports(@Req() r: Req_, @Query('days') d = '30') {
    const days = Math.min(Math.max(Number(d) || 30, 1), 365);
    const { allContacts, contacts, msgs, apptsInRange } = await this.load(r.userId, days);
    const incoming = msgs.filter(m => m.direction === 'in'), ai = msgs.filter(m => m.sender === 'ai'), human = msgs.filter(m => m.sender === 'human');
    const qualified = contacts.filter(c => ['calificado', 'interesado', 'negociacion', 'cerrado'].includes(c.status));
    const closed = contacts.filter(c => c.status === 'cerrado');
    const hours = Array.from({ length: 24 }, (_, h) => incoming.filter(m => m.createdAt.getHours() === h).length);
    const peak = Math.max(...hours);
    const bot = ai.length + human.length;
    return {
      days,
      kpis: { newLeads: contacts.length, qualified: qualified.length, qualifiedPct: contacts.length ? Math.round((qualified.length / contacts.length) * 100) : 0, closed: closed.length, closedPct: qualified.length ? Math.round((closed.length / qualified.length) * 100) : 0, appointments: apptsInRange.length, appointmentsByAi: apptsInRange.filter(a => a.createdBy === 'ai').length },
      timeline: { leads: this.series(days, contacts), messages: this.series(days, msgs), appointments: this.series(days, apptsInRange) },
      funnel: ['nuevo', 'contactado', 'calificado', 'interesado', 'negociacion', 'cerrado'].map(s => ({ status: s, count: allContacts.filter(c => c.status === s).length })),
      indicators: {
        responseRate: incoming.length ? Math.min(100, Math.round((bot / incoming.length) * 100)) : 0,
        messagesPerLead: contacts.length ? Math.round(msgs.length / contacts.length) : 0,
        peakHour: peak > 0 ? hours.indexOf(peak) : null,
        interventions: allContacts.filter(c => c.needsHuman).length,
        aiShare: bot ? Math.round((ai.length / bot) * 100) : 0,
      },
      sources: this.bySource(allContacts),
      hours,
    };
  }

  @Get('raw') async raw(@Req() r: Req_, @Query('days') d = '30') {
    const { contacts, msgs, apptsInRange } = await this.load(r.userId, Number(d) || 30);
    return { contacts, messages: msgs, appointments: apptsInRange };
  }
}
