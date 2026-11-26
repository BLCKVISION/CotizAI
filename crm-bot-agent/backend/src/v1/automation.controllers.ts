import { BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, Req, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Throttle } from '@nestjs/throttler';
import { Repository } from 'typeorm';
import { AgentEngine } from '../agent/agent.engine.js';
import { AgentUnavailable } from '../agent/llm.service.js';
import { JwtGuard } from '../auth/jwt.guard.js';
import { assertPublicUrl } from '../common/ssrf.js';
import { crudController } from '../crm/crud.js';
import { FunnelStepDto } from '../crm/dto.js';
import { AgentConfig, AutomationRule, FunnelStep, Webhook } from '../crm/entities.js';
import { EventsService, WEBHOOK_EVENTS } from '../crm/events.service.js';
import { AGENT_PRESETS, FUNNEL_TEMPLATES, SYSTEM_TEMPLATES } from '../crm/presets.js';
import { randomBytes } from 'node:crypto';
import { AiConfigV1Dto, AiTestDto, RuleV1Dto, WebhookV1Dto } from './dto.js';
import { agentFromV1, agentToV1, parseFaq, ruleFromV1, ruleToV1, type RuleInput } from './mappers.js';
import { full, partial } from './common.js';
import type { Req_ } from './common.js';

// ── Reglas de automatización (formato Replay) ───────────────────────────────
@Controller('v1/funnel/rules')
@UseGuards(JwtGuard)
export class FunnelRulesV1Controller {
  constructor(@InjectRepository(AutomationRule) private repo: Repository<AutomationRule>) {}

  @Get() async list(@Req() r: Req_) { return (await this.repo.find({ where: { userId: r.userId }, order: { createdAt: 'DESC' }, take: 200 })).map(ruleToV1); }
  @Get(':id') async get(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string) { return ruleToV1(await this.owned(r.userId, id)); }

  @Post() async create(@Req() r: Req_, @Body(full()) dto: RuleV1Dto) {
    const data = ruleFromV1(dto as RuleInput);
    this.assertHasAction(data);
    return ruleToV1(await this.repo.save(this.repo.create({ ...data, userId: r.userId })));
  }

  @Put(':id') put(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string, @Body(partial(RuleV1Dto)) dto: Partial<RuleV1Dto>) { return this.update(r, id, dto); }

  /** Mezcla lo recibido con la regla actual (en formato v1) y vuelve a traducir. */
  @Patch(':id') async update(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string, @Body(partial(RuleV1Dto)) dto: Partial<RuleV1Dto>) {
    const cur = await this.owned(r.userId, id);
    const v = ruleToV1(cur);
    const merged: RuleInput = {
      name: dto.name ?? v.name, trigger: dto.trigger ?? v.trigger, isActive: dto.isActive ?? dto.active ?? v.isActive,
      conditions: { ...v.conditions, ...dto.conditions } as RuleInput['conditions'], actions: { ...v.actions, ...dto.actions } as RuleInput['actions'],
      stageFrom: dto.stageFrom, stageTo: dto.stageTo, templateName: dto.templateName,
    };
    const data = ruleFromV1(merged);
    this.assertHasAction(data);
    return ruleToV1(await this.repo.save(Object.assign(cur, data)));
  }

  @Patch(':id/toggle') async toggle(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string) {
    const cur = await this.owned(r.userId, id);
    cur.active = !cur.active;
    return ruleToV1(await this.repo.save(cur));
  }

  @Delete(':id') async remove(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string) {
    await this.owned(r.userId, id);
    await this.repo.manager.query(`DELETE FROM automation_runs WHERE "ruleId" = $1`, [id]);
    await this.repo.delete({ id, userId: r.userId });
    return { success: true, ok: true };
  }

  private assertHasAction(d: ReturnType<typeof ruleFromV1>) {
    if (!d.actions?.moveStatus && !d.actions?.sendText && !d.templateName) throw new BadRequestException('La regla necesita al menos una acción (moveStage, sendTemplate o sendText)');
  }

  private async owned(userId: string, id: string) {
    const r = await this.repo.findOneBy({ id, userId });
    if (!r) throw new NotFoundException();
    return r;
  }
}

// ── Pasos del funnel del agente ─────────────────────────────────────────────
@Controller('v1/funnel/steps')
export class FunnelStepsV1Controller extends crudController('v1/funnel/steps', FunnelStep, { create: FunnelStepDto, order: { position: 'ASC' } }) {
  @Put(':id') @UseGuards(JwtGuard)
  put(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string, @Body(partial(FunnelStepDto)) body: Partial<FunnelStepDto>) { return this.update(r, id, body as unknown as Record<string, unknown>); }

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

// ── Webhooks salientes ──────────────────────────────────────────────────────
const webhookView = (h: Webhook) => ({ id: h.id, name: h.name, url: h.url, secret: h.secret, events: h.events, isActive: h.active, lastDeliveryAt: h.lastDeliveryAt, lastStatus: h.lastStatus, createdAt: h.createdAt });

@Controller('v1/webhooks')
@UseGuards(JwtGuard)
export class WebhooksV1Controller {
  constructor(@InjectRepository(Webhook) private repo: Repository<Webhook>, private events: EventsService) {}

  @Get() async list(@Req() r: Req_) { return (await this.repo.find({ where: { userId: r.userId }, order: { createdAt: 'DESC' }, take: 100 })).map(webhookView); }
  @Get('events') eventList() { return WEBHOOK_EVENTS; }
  @Get(':id') async get(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string) { return webhookView(await this.owned(r.userId, id)); }

  /** El secreto lo genera el servidor; el que mande el cliente se ignora. */
  @Post() async create(@Req() r: Req_, @Body(full()) dto: WebhookV1Dto) {
    await assertPublicUrl(dto.url);
    const events = this.cleanEvents(dto.events);
    return webhookView(await this.repo.save(this.repo.create({ userId: r.userId, name: dto.name, url: dto.url, events, active: dto.isActive ?? true, secret: 'whsec_' + randomBytes(24).toString('hex') })));
  }

  @Put(':id') put(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string, @Body(partial(WebhookV1Dto)) dto: Partial<WebhookV1Dto>) { return this.update(r, id, dto); }
  @Patch(':id') async update(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string, @Body(partial(WebhookV1Dto)) dto: Partial<WebhookV1Dto>) {
    const cur = await this.owned(r.userId, id);
    if (dto.url !== undefined) { await assertPublicUrl(dto.url); cur.url = dto.url; }
    if (dto.name !== undefined) cur.name = dto.name;
    if (dto.events !== undefined) cur.events = this.cleanEvents(dto.events);
    if (dto.isActive !== undefined) cur.active = dto.isActive;
    return webhookView(await this.repo.save(cur));
  }

  @Patch(':id/toggle') async toggle(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string) {
    const cur = await this.owned(r.userId, id);
    cur.active = !cur.active;
    return webhookView(await this.repo.save(cur));
  }

  @Post(':id/test') @HttpCode(200) async test(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string) {
    const h = await this.owned(r.userId, id);
    const message = `Relay test webhook ping para ${h.name}`;
    const status = await this.events.deliver(h, 'test.ping', { message });
    return { status, deliveredAt: new Date(), targetUrl: h.url, payload: { event: 'test.ping', timestamp: Date.now(), message } };
  }

  @Delete(':id') async remove(@Req() r: Req_, @Param('id', ParseUUIDPipe) id: string) {
    await this.owned(r.userId, id);
    await this.repo.delete({ id, userId: r.userId });
    return { success: true, ok: true };
  }

  private cleanEvents(e?: string[]) {
    const ok = (e ?? []).filter(x => WEBHOOK_EVENTS.includes(x));
    return ok.length ? [...new Set(ok)] : e === undefined ? WEBHOOK_EVENTS : ok;
  }

  private async owned(userId: string, id: string) {
    const h = await this.repo.findOneBy({ id, userId });
    if (!h) throw new NotFoundException();
    return h;
  }
}

// ── Configuración del agente IA ─────────────────────────────────────────────
@Controller('v1/ai-config')
@UseGuards(JwtGuard)
export class AiConfigV1Controller {
  constructor(@InjectRepository(AgentConfig) private repo: Repository<AgentConfig>, private engine: AgentEngine) {}

  private async current(userId: string) { return (await this.repo.findOneBy({ userId })) ?? this.repo.save(this.repo.create({ userId })); }

  @Get() async get(@Req() r: Req_) { return agentToV1(await this.current(r.userId)); }

  @Get('templates') templates() { return SYSTEM_TEMPLATES; }
  @Get('presets') presets() { return AGENT_PRESETS; }

  @Put() async save(@Req() r: Req_, @Body(partial(AiConfigV1Dto)) dto: Partial<AiConfigV1Dto>) {
    const cur = await this.current(r.userId);
    Object.assign(cur, agentFromV1(dto), { configured: true });
    return agentToV1(await this.repo.save(cur));
  }

  @Post('apply-template/:template') @HttpCode(200) async apply(@Req() r: Req_, @Param('template') template: string) {
    const t = SYSTEM_TEMPLATES.find(x => x.id === template);
    if (!t) throw new NotFoundException('Plantilla no encontrada');
    const cur = await this.current(r.userId);
    Object.assign(cur, { name: t.agentName, agentRole: t.agentRole, personality: t.personality, greeting: t.greeting, salesFlow: t.salesFlow, restrictions: t.restrictions, faq: parseFaq(t.faq), configured: true });
    return { ...agentToV1(await this.repo.save(cur)), success: true, applied: template };
  }

  /** Una respuesta de prueba con la configuración real; no guarda nada. */
  @Post('test') @HttpCode(200) @Throttle({ default: { ttl: 60_000, limit: 20 } })
  async test(@Req() r: Req_, @Body(full()) dto: AiTestDto) {
    try { return { response: await this.engine.preview(r.userId, dto.message) }; }
    catch (e) { if (e instanceof AgentUnavailable) throw new ServiceUnavailableException(e.message); throw e; }
  }
}
