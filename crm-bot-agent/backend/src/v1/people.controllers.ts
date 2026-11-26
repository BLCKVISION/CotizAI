import { BadRequestException, Body, Controller, Delete, Get, Header, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { InboxService } from '../agent/inbox.service.js';
import { JwtGuard } from '../auth/jwt.guard.js';
import { Appointment, AutomationRun, CONTACT_STATUSES, Contact, Message } from '../crm/entities.js';
import { EventsService } from '../crm/events.service.js';
import { AppointmentStatusDto, AppointmentV1Dto, AssignDto, ContactImportDto, ContactV1Dto, ResolveDto, StageDto, TextDto } from './dto.js';
import { apptStatusIn, apptView, clampInt, contactView, convStatus, likePattern, messageView } from './mappers.js';
import { full, partial } from './common.js';
import type { Req_ } from './common.js';

const MANUAL_PAUSE_MS = 12 * 3600_000;

// ── Contactos ───────────────────────────────────────────────────────────────
@Controller('v1/contacts')
@UseGuards(JwtGuard)
export class ContactsV1Controller {
  constructor(@InjectRepository(Contact) private repo: Repository<Contact>, private events: EventsService) {}

  @Get() async list(@Req() r: Req_, @Query('stage') stage?: string, @Query('search') search?: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    if (stage && !(CONTACT_STATUSES as readonly string[]).includes(stage)) throw new BadRequestException('stage inválido');
    const lim = clampInt(limit, 20, 1, 100), pg = clampInt(page, 1, 1, 100_000);
    const qb = this.repo.createQueryBuilder('c').where('c.userId = :u', { u: r.userId }).orderBy('c.updatedAt', 'DESC').skip((pg - 1) * lim).take(lim);
    if (stage) qb.andWhere('c.status = :stage', { stage });
    if (search?.trim()) qb.andWhere('(c.name ILIKE :s OR c.phone ILIKE :s OR c.email ILIKE :s)', { s: likePattern(search.trim().slice(0, 100)) });
    const [rows, total] = await qb.getManyAndCount();
    return { data: rows.map(contactView), total, page: pg, limit: lim };
  }

  @Get('pipeline') async pipeline(@Req() r: Req_) {
    const rows = await this.repo.find({ where: { userId: r.userId }, order: { updatedAt: 'DESC' }, take: 2000 });
    return Object.fromEntries(CONTACT_STATUSES.map(s => [s, rows.filter(c => c.status === s).map(contactView)]));
  }

  @Get('export') @Header('Content-Type', 'text/csv; charset=utf-8')
  async export(@Req() r: Req_) {
    const list = await this.repo.find({ where: { userId: r.userId }, order: { createdAt: 'DESC' }, take: 50_000 });
    // El prefijo ' neutraliza fórmulas (=, +, -, @) al abrir el CSV en Excel.
    const esc = (v: unknown) => { const t = String(v ?? ''); return `"${(/^[=+\-@\t\r]/.test(t) ? "'" + t : t).replace(/"/g, '""')}"`; };
    return ['nombre,telefono,email,etapa,score,fuente,etiquetas', ...list.map(c => [c.name, c.phone, c.email, c.status, c.score, c.source, (c.tags ?? []).join(' ')].map(esc).join(','))].join('\n');
  }

  @Post('import') @HttpCode(200) async import(@Req() r: Req_, @Body(full()) body: ContactImportDto) {
    const saved = await this.repo.save(body.rows.map(x => this.repo.create({ name: x.name, phone: x.phone ?? '', email: x.email ?? '', source: 'importado', userId: r.userId })));
    return { imported: saved.length };
  }

  @Get(':id') async get(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string) { return contactView(await this.owned(r.userId, id)); }

  @Post() async create(@Req() r: Req_, @Body(full()) dto: ContactV1Dto) {
    const { stage, status, ...rest } = dto;
    const row = await this.repo.save(this.repo.create({ ...rest, status: stage ?? status ?? 'nuevo', userId: r.userId }));
    this.events.emit(r.userId, 'contact.created', row);
    return contactView(row);
  }

  @Put(':id') put(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string, @Body(partial(ContactV1Dto)) dto: Partial<ContactV1Dto>) { return this.update(r, id, dto); }
  @Patch(':id') async update(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string, @Body(partial(ContactV1Dto)) dto: Partial<ContactV1Dto>) {
    const cur = await this.owned(r.userId, id);
    const { stage, status, ...rest } = dto;
    const next = stage ?? status;
    const from = cur.status;
    Object.assign(cur, rest, next ? { status: next } : {});
    const row = await this.repo.save(cur);
    this.events.emit(r.userId, 'contact.updated', row);
    if (row.status !== from) this.events.statusChanged(r.userId, row, from, row.status);
    return contactView(row);
  }

  @Put(':id/stage') async stage(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string, @Body(full()) dto: StageDto) {
    const cur = await this.owned(r.userId, id);
    const from = cur.status;
    cur.status = dto.stage;
    const row = await this.repo.save(cur);
    if (from !== dto.stage) { this.events.emit(r.userId, 'contact.updated', row); this.events.statusChanged(r.userId, row, from, dto.stage); }
    return { success: true, contact: contactView(row) };
  }

  /** Borra el contacto y sus mensajes; las citas quedan sin contacto (no se pierde la agenda). */
  @Delete(':id') async remove(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string) {
    await this.owned(r.userId, id);
    await this.repo.manager.transaction(async m => {
      await m.delete(Message, { userId: r.userId, contactId: id });
      await m.update(Appointment, { userId: r.userId, contactId: id }, { contactId: null });
      await m.delete(AutomationRun, { contactId: id });
      await m.delete(Contact, { id, userId: r.userId });
    });
    return { success: true, ok: true };
  }

  private async owned(userId: string, id: string) {
    const c = await this.repo.findOneBy({ id, userId });
    if (!c) throw new NotFoundException();
    return c;
  }
}

// ── Conversaciones (una por contacto: id == contactId) ──────────────────────
@Controller('v1/conversations')
@UseGuards(JwtGuard)
export class ConversationsV1Controller {
  constructor(
    @InjectRepository(Contact) private contacts: Repository<Contact>,
    @InjectRepository(Message) private msgs: Repository<Message>,
    private inbox: InboxService,
    private events: EventsService,
  ) {}

  @Get() async list(@Req() r: Req_, @Query('status') status?: string, @Query('search') search?: string, @Query('filter') filter?: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    const lim = clampInt(limit, 30, 1, 100), off = (clampInt(page, 1, 1, 100_000) - 1) * lim;
    const params: unknown[] = [r.userId];
    const where: string[] = [];
    if (status) {
      if (!['bot', 'human', 'resolved'].includes(status)) throw new BadRequestException('status inválido');
      where.push(`cstatus = $${params.push(status)}`);
    }
    if (search?.trim()) { const i = params.push(likePattern(search.trim().slice(0, 100))); where.push(`(name ILIKE $${i} OR phone ILIKE $${i})`); }
    if (filter === 'unread') where.push('unread > 0');
    const rows: (Contact & { lastBody: string; lastAt: Date; unread: number; cstatus: string; total: number })[] = await this.contacts.query(
      `WITH conv AS (
         SELECT c.*, l.body AS "lastBody", l."createdAt" AS "lastAt",
           (SELECT count(*)::int FROM messages m WHERE m."contactId" = c.id AND m.direction = 'in' AND m."createdAt" > COALESCE(c."lastReadAt", 'epoch'::timestamptz)) AS unread,
           CASE WHEN c.resolved THEN 'resolved' WHEN c."needsHuman" OR c."botPausedUntil" > now() THEN 'human' ELSE 'bot' END AS cstatus
         FROM contacts c JOIN LATERAL (SELECT body, "createdAt" FROM messages m WHERE m."contactId" = c.id ORDER BY "createdAt" DESC LIMIT 1) l ON true
         WHERE c."userId" = $1)
       SELECT *, count(*) OVER()::int AS total FROM conv ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY "lastAt" DESC LIMIT ${lim} OFFSET ${off}`,
      params,
    );
    return {
      data: rows.map(x => ({
        id: x.id, contactId: x.id, status: x.cstatus, lastMessagePreview: x.lastBody.slice(0, 120), lastMessageAt: x.lastAt, unreadCount: x.unread,
        assignedAgentId: x.assignedAgentId, contact: contactView(x),
      })),
      total: rows[0]?.total ?? 0,
    };
  }

  /** page=1 son los `limit` mensajes más recientes, en orden cronológico. */
  @Get(':id/messages') async messages(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    await this.owned(r.userId, id);
    const lim = clampInt(limit, 50, 1, 200);
    const rows = await this.msgs.find({ where: { userId: r.userId, contactId: id }, order: { createdAt: 'DESC' }, skip: (clampInt(page, 1, 1, 100_000) - 1) * lim, take: lim });
    return rows.reverse().map(messageView);
  }

  /** Mensaje de una persona del equipo: sale por WhatsApp y pausa la IA 30 min. */
  @Post(':id/messages') async send(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string, @Body(full()) dto: TextDto) {
    const contact = await this.owned(r.userId, id);
    const text = dto.text.trim();
    if (!text) throw new BadRequestException('Mensaje vacío');
    const message = await this.inbox.sendHuman(r.userId, contact, text);
    await this.emitConv(r.userId, contact);
    return messageView(message);
  }

  /** Simula un mensaje entrante del cliente (mismo camino que el webhook de Meta). */
  @Post(':id/incoming') async incoming(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string, @Body(full()) dto: TextDto) {
    const contact = await this.owned(r.userId, id);
    const text = dto.text.trim();
    if (!text) throw new BadRequestException('Mensaje vacío');
    const res = await this.inbox.receive(r.userId, contact, text);
    return { message: messageView(res.message), reply: res.reply ? messageView(res.reply) : null, warning: res.warning };
  }

  @Put(':id/resume-bot') async resume(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string) {
    const c = await this.owned(r.userId, id);
    Object.assign(c, { needsHuman: false, botPausedUntil: null, resolved: false });
    await this.contacts.save(c);
    this.events.emit(r.userId, 'agent.resumed', { contactId: c.id });
    return { success: true, status: await this.emitConv(r.userId, c) };
  }

  @Put(':id/pause-bot') async pause(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string) {
    const c = await this.owned(r.userId, id);
    c.botPausedUntil = new Date(Date.now() + MANUAL_PAUSE_MS);
    await this.contacts.save(c);
    return { success: true, status: await this.emitConv(r.userId, c) };
  }

  @Put(':id/assign') async assign(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string, @Body(full()) dto: AssignDto) {
    const c = await this.owned(r.userId, id);
    if (dto.agentId !== null && dto.agentId !== r.userId) throw new BadRequestException('Solo puedes asignar la conversación a tu propio usuario');
    c.assignedAgentId = dto.agentId;
    await this.contacts.save(c);
    await this.emitConv(r.userId, c);
    return { success: true };
  }

  @Put(':id/read') async read(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string) {
    const c = await this.owned(r.userId, id);
    c.lastReadAt = new Date();
    await this.contacts.save(c);
    await this.emitConv(r.userId, c);
    return { success: true };
  }

  @Put(':id/resolve') async resolve(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string, @Body(full()) dto: ResolveDto) {
    const c = await this.owned(r.userId, id);
    c.resolved = dto.resolved;
    await this.contacts.save(c);
    return { success: true, status: await this.emitConv(r.userId, c) };
  }

  private async owned(userId: string, id: string) {
    const c = await this.contacts.findOneBy({ id, userId });
    if (!c) throw new NotFoundException();
    return c;
  }

  /** Notifica el estado actual de la conversación por tiempo real y lo devuelve. */
  private async emitConv(userId: string, c: Contact) {
    const [{ n }] = await this.msgs.query(`SELECT count(*)::int AS n FROM messages WHERE "userId" = $1 AND "contactId" = $2 AND direction = 'in' AND "createdAt" > COALESCE($3::timestamptz, 'epoch'::timestamptz)`, [userId, c.id, c.lastReadAt]);
    const status = convStatus(c);
    this.events.emit(userId, 'conversation.updated', { contactId: c.id, status, unreadCount: n });
    return status;
  }
}

// ── Citas ───────────────────────────────────────────────────────────────────
@Controller('v1/appointments')
@UseGuards(JwtGuard)
export class AppointmentsV1Controller {
  constructor(
    @InjectRepository(Appointment) private repo: Repository<Appointment>,
    @InjectRepository(Contact) private contacts: Repository<Contact>,
    private events: EventsService,
  ) {}

  @Get() async list(@Req() r: Req_, @Query('startDate') startDate?: string, @Query('endDate') endDate?: string, @Query('status') status?: string) {
    const from = this.date(startDate, 'startDate'), to = this.date(endDate, 'endDate');
    const st = status ? apptStatusIn(status) : null;
    if (status && !st) throw new BadRequestException('status inválido');
    const startsAt = from && to ? Between(from, to) : from ? MoreThanOrEqual(from) : to ? LessThanOrEqual(to) : undefined;
    const rows = await this.repo.find({ where: { userId: r.userId, ...(startsAt ? { startsAt } : {}), ...(st ? { status: st } : {}) }, order: { startsAt: 'ASC' }, take: 500 });
    return this.withContacts(r.userId, rows);
  }

  @Get(':id') async get(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string) { return (await this.withContacts(r.userId, [await this.owned(r.userId, id)]))[0]; }

  @Post() async create(@Req() r: Req_, @Body(full()) dto: AppointmentV1Dto) {
    const contact = await this.resolveContact(r.userId, dto);
    const row = await this.repo.save(this.repo.create({
      userId: r.userId, contactId: contact?.id ?? null, title: dto.title || dto.service || 'Consulta', service: dto.service ?? '', startsAt: new Date(dto.scheduledAt),
      endsAt: dto.endsAt ? new Date(dto.endsAt) : null, notes: dto.notes ?? '', googleMeetLink: dto.googleMeetLink ?? '', status: apptStatusIn(dto.status) ?? 'pendiente', createdBy: 'user',
    }));
    this.events.emit(r.userId, 'appointment.created', Object.assign(row, { contact }));
    return apptView(row, contact);
  }

  @Put(':id') put(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string, @Body(partial(AppointmentV1Dto)) dto: Partial<AppointmentV1Dto>) { return this.update(r, id, dto); }
  @Patch(':id') async update(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string, @Body(partial(AppointmentV1Dto)) dto: Partial<AppointmentV1Dto>) {
    const cur = await this.owned(r.userId, id);
    if (dto.contactId !== undefined) { cur.contactId = (await this.resolveContact(r.userId, { contactId: dto.contactId }))?.id ?? null; }
    if (dto.scheduledAt) { cur.startsAt = new Date(dto.scheduledAt); cur.reminder24hSent = false; cur.reminder2hSent = false; }
    if (dto.endsAt !== undefined) cur.endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    if (dto.service !== undefined) cur.service = dto.service;
    if (dto.title !== undefined) cur.title = dto.title;
    else if (dto.service && !cur.title) cur.title = dto.service;
    if (dto.notes !== undefined) cur.notes = dto.notes;
    if (dto.googleMeetLink !== undefined) cur.googleMeetLink = dto.googleMeetLink;
    if (dto.status) cur.status = apptStatusIn(dto.status)!;
    const row = await this.repo.save(cur);
    this.events.emit(r.userId, 'appointment.updated', row);
    return (await this.withContacts(r.userId, [row]))[0];
  }

  @Patch(':id/status') async status(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string, @Body(full()) dto: AppointmentStatusDto) {
    const cur = await this.owned(r.userId, id);
    cur.status = apptStatusIn(dto.status)!;
    const row = await this.repo.save(cur);
    this.events.emit(r.userId, 'appointment.updated', row);
    return (await this.withContacts(r.userId, [row]))[0];
  }

  @Delete(':id') async remove(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string) {
    await this.owned(r.userId, id);
    await this.repo.delete({ id, userId: r.userId });
    return { success: true, ok: true };
  }

  private date(v: string | undefined, name: string) {
    if (!v) return null;
    const d = new Date(v);
    if (Number.isNaN(+d)) throw new BadRequestException(`${name} inválida`);
    return d;
  }

  private async owned(userId: string, id: string) {
    const a = await this.repo.findOneBy({ id, userId });
    if (!a) throw new NotFoundException();
    return a;
  }

  private async withContacts(userId: string, rows: Appointment[]) {
    const ids = [...new Set(rows.map(a => a.contactId).filter((x): x is string => !!x))];
    const cs = ids.length ? await this.contacts.findBy({ userId, id: In(ids) }) : [];
    const byId = new Map(cs.map(c => [c.id, c]));
    return rows.map(a => apptView(a, a.contactId ? byId.get(a.contactId) : null));
  }

  /** contactId (debe ser del usuario) o contactName+contactPhone (busca por teléfono o crea el contacto). */
  private async resolveContact(userId: string, dto: Pick<AppointmentV1Dto, 'contactId' | 'contactName' | 'contactPhone'>) {
    if (dto.contactId) {
      const c = await this.contacts.findOneBy({ id: dto.contactId, userId });
      if (!c) throw new BadRequestException('contactId no existe');
      return c;
    }
    const name = dto.contactName?.trim();
    if (!name) return null;
    const phone = dto.contactPhone?.trim() ?? '';
    const found = phone ? await this.contacts.findOneBy({ userId, phone }) : null;
    if (found) return found;
    const created = await this.contacts.save(this.contacts.create({ userId, name, phone, source: 'agenda' }));
    this.events.emit(userId, 'contact.created', created);
    return created;
  }
}

