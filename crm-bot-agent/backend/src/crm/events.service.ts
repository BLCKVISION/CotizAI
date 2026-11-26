import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { assertPublicUrl } from '../common/ssrf.js';
import { InjectRepository } from '@nestjs/typeorm';
import { createHmac } from 'node:crypto';
import { Repository } from 'typeorm';
import { Webhook } from './entities.js';

export const WEBHOOK_EVENTS = ['contact.created', 'contact.updated', 'appointment.created', 'appointment.updated', 'message.received', 'message.sent', 'contact.status_changed', 'lead.stage_changed', 'stock.updated', 'stock.low'];

@Injectable()
export class EventsService {
  private log = new Logger('Webhooks');
  /** Bus interno: lo usan las automatizaciones y el tiempo real, además de los webhooks salientes. */
  readonly bus = new EventEmitter();
  constructor(@InjectRepository(Webhook) private hooks: Repository<Webhook>) {}

  /** Dispara los webhooks suscritos sin bloquear la petición. */
  emit(userId: string, event: string, data: unknown) {
    this.bus.emit('event', { userId, event, data });
    void this.hooks.findBy({ userId, active: true }).then(list =>
      Promise.all(list.filter(h => h.events.includes(event)).map(h => this.deliver(h, event, data))),
    );
  }

  /** Cambio de estado de un cliente (lo consumen las automatizaciones y, si se suscribe, los webhooks). */
  statusChanged(userId: string, contact: unknown, from: string, to: string) {
    this.emit(userId, 'contact.status_changed', { contact, from, to });
    this.emit(userId, 'lead.stage_changed', { contact, from, to }); // nombre que usa el frontend de Replay
  }

  async deliver(h: Webhook, event: string, data: unknown) {
    const body = JSON.stringify({ event, timestamp: new Date().toISOString(), data });
    const signature = 'sha256=' + createHmac('sha256', h.secret).update(body).digest('hex');
    let status = 0;
    try {
      await assertPublicUrl(h.url);
      const res = await fetch(h.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Signature': signature, 'X-Event': event },
        body,
        signal: AbortSignal.timeout(8000),
        redirect: 'manual', // un redirect podría llevar a una red interna
      });
      status = res.status;
    } catch (e) {
      this.log.warn(`${h.url}: ${(e as Error).message}`);
    }
    await this.hooks.update(h.id, { lastDeliveryAt: new Date(), lastStatus: status });
    return status;
  }
}
