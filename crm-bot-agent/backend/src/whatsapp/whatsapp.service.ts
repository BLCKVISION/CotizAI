import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import { Repository } from 'typeorm';
import { WhatsappAccount } from '../crm/entities.js';

const GRAPH = process.env['WHATSAPP_GRAPH_URL'] ?? 'https://graph.facebook.com/v21.0';

@Injectable()
export class WhatsappService {
  private log = new Logger('WhatsApp');
  constructor(@InjectRepository(WhatsappAccount) private repo: Repository<WhatsappAccount>) {}

  find(userId: string) { return this.repo.findOneBy({ userId }); }
  byPhoneNumberId(id: string) { return this.repo.findOneBy({ phoneNumberId: id }); }
  byVerifyToken(token: string) { return this.repo.findOneBy({ verifyToken: token }); }

  /** Valida las credenciales contra la API de Meta y las guarda. */
  async connect(userId: string, phoneNumberId: string, accessToken: string, wabaId = '') {
    const owner = await this.byPhoneNumberId(phoneNumberId);
    if (owner && owner.userId !== userId) throw new ConflictException('Ese número de WhatsApp ya está conectado a otra cuenta');
    const res = await fetch(`${GRAPH}/${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name`, { headers: { Authorization: `Bearer ${accessToken}` } });
    const body = (await res.json().catch(() => ({}))) as { display_phone_number?: string; error?: { message: string } };
    if (!res.ok) throw new BadRequestException(`Meta rechazó las credenciales: ${body.error?.message ?? res.status}`);
    const cur = await this.find(userId);
    const acc = this.repo.create({ ...(cur ?? {}), userId, phoneNumberId, accessToken, wabaId, displayPhone: body.display_phone_number ?? '', verifyToken: cur?.verifyToken ?? randomBytes(16).toString('hex') });
    return this.repo.save(acc);
  }

  async rotateVerifyToken(userId: string) {
    const acc = await this.find(userId);
    if (!acc) throw new BadRequestException('WhatsApp no está conectado');
    acc.verifyToken = randomBytes(16).toString('hex');
    return this.repo.save(acc);
  }

  async disconnect(userId: string) { await this.repo.delete({ userId }); }

  async sendText(acc: WhatsappAccount, to: string, body: string) {
    const res = await fetch(`${GRAPH}/${acc.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${acc.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: to.replace(/\D/g, ''), type: 'text', text: { body } }),
    });
    if (!res.ok) { this.log.warn(`Envío fallido (${res.status}): ${(await res.text()).slice(0, 200)}`); return false; }
    return true;
  }
}
