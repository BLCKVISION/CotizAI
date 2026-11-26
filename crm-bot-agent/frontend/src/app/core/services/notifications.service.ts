import { Injectable, inject, signal } from '@angular/core';
import { RealtimeService } from './realtime.service';

export interface AppNotification { id: number; icon: string; tone: 'green' | 'blue' | 'amber' | 'red'; title: string; at: Date; link?: string }

/** Notificaciones reales de la sesión, generadas a partir de los eventos en vivo del backend. */
@Injectable({ providedIn: 'root' })
export class NotificationsService {
  items = signal<AppNotification[]>([]);
  unread = signal(0);
  private seq = 0;

  constructor() {
    inject(RealtimeService).events$.subscribe(({ event, data }) => {
      const name = data?.contact?.name ?? data?.appointment?.contact?.name ?? data?.message?.contactName ?? 'un cliente';
      switch (event) {
        case 'human_intervention': this.push('support_agent', 'amber', `${name} necesita atención humana`, '/conversations'); break;
        case 'appointment_booked': this.push('event_available', 'green', `Nueva cita agendada con ${name}`, '/agenda'); break;
        case 'stock_alert': this.push('inventory_2', 'red', `Stock bajo: ${data?.product?.name ?? 'producto'}`, '/productos'); break;
        case 'new_message': if ((data?.message?.sender ?? 'customer') === 'customer') this.push('chat', 'blue', `Nuevo mensaje de ${name}`, '/conversations'); break;
      }
    });
  }

  private push(icon: string, tone: AppNotification['tone'], title: string, link?: string) {
    this.items.update((l) => [{ id: ++this.seq, icon, tone, title, at: new Date(), link }, ...l].slice(0, 30));
    this.unread.update((n) => n + 1);
  }

  markRead() { this.unread.set(0); }
  clear() { this.items.set([]); this.unread.set(0); }
}
