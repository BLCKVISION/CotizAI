import { Injectable, effect, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

export interface RealtimeEvent { event: string; data: any }

/** Eventos con nombre propio que emite el backend (además del envoltorio genérico "crm"). */
const NAMED = ['new_message', 'conversation_updated', 'human_intervention', 'agent_resumed', 'contact_stage_changed', 'appointment_booked', 'stock_alert'];

/**
 * Conexión Socket.IO autenticada con el JWT. Se abre al iniciar sesión y se cierra al salir;
 * reconecta sola. Los componentes se suscriben a `events$`.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private auth = inject(AuthService);
  private socket?: Socket;
  readonly events$ = new Subject<RealtimeEvent>();
  readonly connected = signal(false);

  constructor() {
    effect(() => {
      const user = this.auth.currentUser();
      if (user) this.connect(); else this.disconnect();
    });
  }

  emit(event: string, payload: unknown) { this.socket?.emit(event, payload); }

  private connect() {
    const token = this.auth.getToken();
    if (!token || this.socket) return;
    // Namespace /ws; tras nginx el path es /api/socket.io (el prefijo /api se quita al reenviar).
    this.socket = io('/ws', { path: environment.wsPath, auth: { token }, transports: ['websocket'], reconnectionDelayMax: 10_000 });
    this.socket.on('connect', () => this.connected.set(true));
    this.socket.on('disconnect', () => this.connected.set(false));
    this.socket.on('connect_error', () => this.connected.set(false));
    for (const name of NAMED) this.socket.on(name, (data) => this.events$.next({ event: name, data }));
    this.socket.on('crm', (e: RealtimeEvent) => this.events$.next(e));
  }

  private disconnect() {
    this.socket?.disconnect();
    this.socket = undefined;
    this.connected.set(false);
  }
}
