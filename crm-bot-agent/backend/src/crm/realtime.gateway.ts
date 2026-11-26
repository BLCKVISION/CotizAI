import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayInit, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { apptView, contactView, convStatus, messageView } from '../v1/mappers.js';
import type { Appointment, Contact, Message } from './entities.js';
import { EventsService } from './events.service.js';

type Bus = { userId: string; event: string; data: unknown };
const ORIGINS = () => (process.env['CORS_ORIGIN'] ?? 'http://localhost:4200').split(',');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Eventos del CRM que se envían en vivo (formato nativo, evento `crm`). */
const LIVE = new Set(['message.received', 'message.sent', 'contact.created', 'contact.updated', 'appointment.created', 'appointment.updated', 'stock.updated', 'stock.low']);

/** Autentica el handshake con el JWT y mete el socket en la sala de SU usuario (nunca en la de otro). */
async function authenticate(jwt: JwtService, client: Socket, log: Logger) {
  const auth = client.handshake.auth as { token?: string } | undefined;
  const token = auth?.token ?? client.handshake.headers.authorization?.split(' ')[1];
  try {
    const { sub } = await jwt.verifyAsync<{ sub: string }>(token ?? '', { algorithms: ['HS256'] });
    client.data['userId'] = sub;
    await client.join(`user:${sub}`);
    return sub;
  } catch {
    log.debug('Conexión rechazada: token inválido');
    client.disconnect(true);
    return null;
  }
}

/**
 * Tiempo real para el frontend de Replay: namespace `/ws`, eventos `new_message`, `conversation_updated`,
 * `human_intervention`, `agent_resumed`, `contact_stage_changed`, `appointment_booked`, `stock_alert`,
 * y `typing` entre sockets del mismo usuario. Además emite `crm` con el evento nativo.
 */
@WebSocketGateway({ namespace: '/ws', cors: { origin: ORIGINS() } })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private log = new Logger('Realtime');
  @WebSocketServer() server!: Namespace;
  constructor(private jwt: JwtService, private events: EventsService) {}

  afterInit() { this.events.bus.on('event', (e: Bus) => this.forward(e)); }

  handleConnection(client: Socket) { return authenticate(this.jwt, client, this.log); }

  private to(userId: string, event: string, payload: unknown) { this.server.to(`user:${userId}`).emit(event, payload); }

  private forward({ userId, event, data }: Bus) {
    if (LIVE.has(event)) this.to(userId, 'crm', { event, data });
    const d = data as Record<string, unknown>;
    switch (event) {
      case 'message.received': case 'message.sent': {
        const m = d['message'] as Message;
        this.to(userId, 'new_message', { conversationId: m.contactId, message: messageView(m) });
        break;
      }
      case 'conversation.updated':
        this.to(userId, 'conversation_updated', { conversationId: d['contactId'], status: d['status'], unreadCount: d['unreadCount'] });
        break;
      case 'handoff': {
        const c = d['contact'] as Contact;
        this.to(userId, 'human_intervention', { conversationId: c.id, contactId: c.id, reason: d['reason'] ?? '' });
        this.to(userId, 'conversation_updated', { conversationId: c.id, status: convStatus(c) });
        break;
      }
      case 'agent.resumed': this.to(userId, 'agent_resumed', { conversationId: d['contactId'] }); break;
      case 'contact.status_changed': this.to(userId, 'contact_stage_changed', { contactId: (d['contact'] as Contact).id, from: d['from'], to: d['to'], stage: d['to'], contact: contactView(d['contact'] as Contact) }); break;
      case 'appointment.created': { const a = data as Appointment & { contact?: Contact | null }; this.to(userId, 'appointment_booked', { appointment: apptView(a, a.contact) }); break; }
      case 'stock.low': this.to(userId, 'stock_alert', { product: d['product'] }); break;
    }
  }

  // Las salas de conversación incluyen el id del usuario: no se puede escuchar la de otra cuenta.
  private room(client: Socket, id: unknown) { return typeof id === 'string' && UUID.test(id) && client.data['userId'] ? `conv:${client.data['userId']}:${id}` : null; }

  @SubscribeMessage('join_conversation')
  async join(@MessageBody() data: { conversationId?: string }, @ConnectedSocket() client: Socket) { const r = this.room(client, data?.conversationId); if (r) await client.join(r); }

  @SubscribeMessage('leave_conversation')
  async leave(@MessageBody() data: { conversationId?: string }, @ConnectedSocket() client: Socket) { const r = this.room(client, data?.conversationId); if (r) await client.leave(r); }

  @SubscribeMessage('typing')
  typing(@MessageBody() data: { conversationId?: string; isTyping?: boolean }, @ConnectedSocket() client: Socket) {
    const r = this.room(client, data?.conversationId);
    if (r) client.to(r).emit('typing', { conversationId: data.conversationId, userId: client.data['userId'], isTyping: !!data.isTyping });
  }
}

/** Namespace raíz `/` del frontend anterior: solo el evento genérico `crm`. */
@WebSocketGateway({ cors: { origin: ORIGINS() } })
export class LegacyRealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private log = new Logger('RealtimeLegacy');
  @WebSocketServer() server!: Namespace;
  constructor(private jwt: JwtService, private events: EventsService) {}

  afterInit() { this.events.bus.on('event', ({ userId, event, data }: Bus) => { if (LIVE.has(event)) this.server.to(`user:${userId}`).emit('crm', { event, data }); }); }

  handleConnection(client: Socket) { return authenticate(this.jwt, client, this.log); }
}
