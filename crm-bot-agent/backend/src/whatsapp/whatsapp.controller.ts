import { createHmac, timingSafeEqual } from 'node:crypto';
import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Post, Query, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InboxService } from '../agent/inbox.service.js';
import { JwtGuard } from '../auth/jwt.guard.js';
import { ConnectV1Dto } from '../v1/dto.js';
import { Contact } from '../crm/entities.js';
import { OnboardingService } from '../onboarding/onboarding.service.js';
import { WhatsappService } from './whatsapp.service.js';

type Req_ = { userId: string };
interface WaPayload { entry?: { changes?: { value?: { metadata?: { phone_number_id: string }; contacts?: { wa_id: string; profile?: { name?: string } }[]; messages?: { id: string; from: string; type: string; text?: { body: string } }[] } }[] }[] }

@Controller(['whatsapp', 'v1/whatsapp'])
export class WhatsappController {
  constructor(
    private wa: WhatsappService,
    private inbox: InboxService,
    private onboarding: OnboardingService,
    private config: ConfigService,
    @InjectRepository(Contact) private contacts: Repository<Contact>,
  ) {}

  @Get('status') @UseGuards(JwtGuard)
  async status(@Req() r: Req_) {
    const a = await this.wa.find(r.userId);
    return { connected: !!a, displayPhone: a?.displayPhone ?? null, phoneNumber: a?.displayPhone ?? null, phoneNumberId: a?.phoneNumberId ?? null, wabaId: a?.wabaId ?? '', qualityRating: null, ...this.urls(a?.verifyToken) };
  }

  @Post('connect') @UseGuards(JwtGuard) @HttpCode(200)
  async connect(@Req() r: Req_, @Body(new ValidationPipe({ whitelist: true, transform: true })) b: ConnectV1Dto) {
    const a = await this.wa.connect(r.userId, b.phoneNumberId.trim(), b.accessToken.trim(), b.wabaId?.trim() ?? '');
    await this.onboarding.connectWhatsapp(r.userId);
    return { connected: true, displayPhone: a.displayPhone, phoneNumber: a.displayPhone, phoneNumberId: a.phoneNumberId, wabaId: a.wabaId, qualityRating: null, ...this.urls(a.verifyToken) };
  }

  @Delete('connect') @UseGuards(JwtGuard)
  async disconnect(@Req() r: Req_) { await this.wa.disconnect(r.userId); return { ok: true }; }

  /** Genera un nuevo token de verificación (hay que actualizarlo también en el panel de Meta). */
  @Post('verify-token/rotate') @UseGuards(JwtGuard) @HttpCode(200)
  async rotate(@Req() r: Req_) {
    const a = await this.wa.rotateVerifyToken(r.userId);
    return this.urls(a.verifyToken);
  }

  private urls(verifyToken?: string) {
    return { webhookUrl: `${this.config.get('PUBLIC_URL') ?? 'http://localhost:3000'}/whatsapp/webhook`, verifyToken: verifyToken ?? null };
  }

  /** Verificación del webhook de Meta (público). */
  @Get('webhook')
  async verify(@Query('hub.mode') mode: string, @Query('hub.verify_token') token: string, @Query('hub.challenge') challenge: string) {
    if (mode === 'subscribe' && token && (await this.wa.byVerifyToken(token))) return challenge;
    throw new ForbiddenException();
  }

  /** Mensajes entrantes de Meta (público). Responde 200 enseguida y procesa en segundo plano. */
  @Post('webhook') @HttpCode(200)
  receive(@Req() req: { rawBody?: Buffer; headers: Record<string, string> }, @Body() body: WaPayload) {
    const secret = this.config.get<string>('META_APP_SECRET');
    // En producción la firma es obligatoria: sin ella cualquiera podría inyectar mensajes falsos.
    if (!secret && this.config.get('NODE_ENV') === 'production') throw new ForbiddenException('META_APP_SECRET no configurado');
    if (secret) {
      const sig = req.headers['x-hub-signature-256'] ?? '';
      const expected = 'sha256=' + createHmac('sha256', secret).update(req.rawBody ?? Buffer.alloc(0)).digest('hex');
      if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) throw new ForbiddenException('Firma inválida');
    }
    void this.process(body);
    return { ok: true };
  }

  private async process(body: WaPayload) {
    for (const entry of body.entry ?? []) for (const ch of entry.changes ?? []) {
      const v = ch.value; if (!v?.messages?.length || !v.metadata) continue;
      const acc = await this.wa.byPhoneNumberId(v.metadata.phone_number_id); if (!acc) continue;
      for (const m of v.messages) {
        if (m.type !== 'text' || !m.text?.body) continue;
        const dup = await this.contacts.manager.query('SELECT 1 FROM messages WHERE "userId"=$1 AND "externalId"=$2 LIMIT 1', [acc.userId, m.id]);
        if (dup.length) continue;
        const phone = '+' + m.from;
        let contact = await this.contacts.findOneBy({ userId: acc.userId, phone });
        contact ??= await this.contacts.save(this.contacts.create({ userId: acc.userId, phone, name: v.contacts?.find(c => c.wa_id === m.from)?.profile?.name ?? phone, source: 'whatsapp' }));
        await this.inbox.receive(acc.userId, contact, m.text.body, m.id);
      }
    }
  }
}
