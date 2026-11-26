import { Component, ElementRef, OnDestroy, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { RealtimeService } from '../../core/services/realtime.service';
import { UiService } from '../../core/ui/ui.service';
import { errMsg } from '../../core/ui/errors';

export interface Message {
  id: string;
  conversationId?: string;
  content: string;
  sender: 'customer' | 'agent' | 'bot' | 'system';
  automated?: boolean;
  type: string;
  createdAt: string;
  status?: string;
  transcription?: string;
  audioDuration?: string;
}

export interface Conversation {
  id: string;
  status: 'bot' | 'human' | 'resolved';
  lastMessagePreview: string;
  lastMessageAt: string;
  unreadCount: number;
  contact: { id: string; name: string; phone: string; stage: string; avatarUrl?: string | null; email?: string; city?: string; ci?: string; tags?: string[]; budget?: string };
}

@Component({
  selector: 'app-conversations',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './conversations.component.html',
  styleUrls: ['./conversations.component.scss'],
})
export class ConversationsComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private ui = inject(UiService);
  private realtime = inject(RealtimeService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private sub?: Subscription;

  @ViewChild('messagesContainer') private viewport?: ElementRef<HTMLElement>;

  conversations = signal<Conversation[]>([]);
  selectedConv = signal<Conversation | null>(null);
  messages = signal<Message[]>([]);
  templates = signal<{ id: string; name: string; body: string }[]>([]);

  newMessage = '';
  loading = signal(true);
  loadError = signal(false);
  sending = signal(false);
  searchQuery = '';
  activeFilter = signal<'all' | 'bot' | 'human' | 'unread'>('all');
  showLeadDrawer = signal(false);
  testMode = signal(false);

  filteredConversations = computed(() => {
    let list = this.conversations();
    const q = this.searchQuery.toLowerCase().trim();
    if (q) list = list.filter((c) => c.contact.name.toLowerCase().includes(q) || (c.contact.phone ?? '').includes(q) || (c.lastMessagePreview ?? '').toLowerCase().includes(q));
    const f = this.activeFilter();
    if (f === 'bot') list = list.filter((c) => c.status === 'bot');
    if (f === 'human') list = list.filter((c) => c.status === 'human');
    if (f === 'unread') list = list.filter((c) => c.unreadCount > 0);
    return list;
  });

  /** Mensajes con separadores por día. */
  rows = computed(() => {
    let last = '';
    return this.messages().map((m) => {
      const d = new Date(m.createdAt), key = d.toDateString();
      const divider = key !== last ? this.dayLabel(d) : '';
      last = key;
      return { m, divider };
    });
  });

  ngOnInit() {
    this.loadConversations();
    this.api.getTemplates().subscribe({ next: (t) => this.templates.set(t.filter((x) => x.body)), error: () => {} });
    this.sub = this.realtime.events$.subscribe((e) => this.onRealtime(e.event, e.data));
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
    const c = this.selectedConv();
    if (c) this.realtime.emit('leave_conversation', { conversationId: c.id });
  }

  loadConversations(selectFirst = true) {
    this.api.getConversations().subscribe({
      next: (res) => {
        const list = res?.data ?? [];
        this.conversations.set(list);
        this.loading.set(false); this.loadError.set(false);
        const wanted = this.route.snapshot.queryParamMap.get('contact');
        const current = this.selectedConv();
        if (wanted && !current) {
          const c = list.find((x) => x.id === wanted || x.contact.id === wanted);
          if (c) this.selectConversation(c);
          else this.ui.toast('Este contacto todavía no tiene conversación.', 'info');
        } else if (selectFirst && !current && list.length && (typeof window === 'undefined' || window.innerWidth > 768)) this.selectConversation(list[0]);
        else if (current) { const fresh = list.find((x) => x.id === current.id); if (fresh) this.selectedConv.set(fresh); }
      },
      error: () => { this.loading.set(false); this.loadError.set(true); },
    });
  }

  selectConversation(conv: Conversation) {
    const prev = this.selectedConv();
    if (prev && prev.id !== conv.id) this.realtime.emit('leave_conversation', { conversationId: prev.id });
    this.selectedConv.set(conv);
    this.messages.set([]);
    this.loadMessages(conv.id);
    if (conv.unreadCount > 0) {
      this.patch(conv.id, { unreadCount: 0 });
      this.api.markRead(conv.id).subscribe({ error: () => {} });
    }
    this.realtime.emit('join_conversation', { conversationId: conv.id });
  }

  loadMessages(convId: string) {
    this.api.getMessages(convId).subscribe({
      next: (msgs) => { if (this.selectedConv()?.id === convId) { this.messages.set(msgs); this.scrollBottom(); } },
      error: (e) => this.ui.error(errMsg(e, 'No se pudieron cargar los mensajes')),
    });
  }

  sendMessage() {
    const conv = this.selectedConv();
    const text = this.newMessage.trim();
    if (!conv || !text || this.sending()) return;
    this.sending.set(true);
    const test = this.testMode();
    const req = test ? this.api.simulateIncoming(conv.id, text) : this.api.sendMessage(conv.id, text);
    req.subscribe({
      next: (res) => {
        this.sending.set(false); this.newMessage = '';
        if (test) { if (res?.warning) this.ui.toast(res.warning, 'info', 5000); }
        else if (res) this.appendMessage(conv.id, res as Message);
        this.refreshAfterSend(conv.id);
      },
      error: (e) => { this.sending.set(false); this.ui.error(errMsg(e, 'No se pudo enviar el mensaje')); },
    });
  }

  private refreshAfterSend(convId: string) {
    // El socket normalmente ya trajo los mensajes; esto garantiza consistencia si no hubo conexión en vivo.
    setTimeout(() => { if (this.selectedConv()?.id === convId) { this.loadMessages(convId); this.loadConversations(false); } }, 600);
  }

  insertTemplate(body: string) { this.newMessage = body; }

  toggleBotStatus() {
    const conv = this.selectedConv();
    if (!conv) return;
    const toHuman = conv.status === 'bot';
    (toHuman ? this.api.pauseBot(conv.id) : this.api.resumeBot(conv.id)).subscribe({
      next: () => { this.patch(conv.id, { status: toHuman ? 'human' : 'bot' }); this.ui.success(toHuman ? 'IA pausada: ahora respondes tú.' : 'IA reanudada.'); },
      error: (e) => this.ui.error(errMsg(e, 'No se pudo cambiar el modo')),
    });
  }

  toggleResolved() {
    const conv = this.selectedConv();
    if (!conv) return;
    const resolved = conv.status !== 'resolved';
    this.api.resolveConversation(conv.id, resolved).subscribe({
      next: (r) => { this.patch(conv.id, { status: r?.status ?? (resolved ? 'resolved' : 'bot') }); this.ui.success(resolved ? 'Conversación marcada como resuelta' : 'Conversación reabierta'); },
      error: (e) => this.ui.error(errMsg(e)),
    });
  }

  openInCrm() { this.router.navigate(['/crm'], { queryParams: { q: this.selectedConv()?.contact.name } }); }

  // ── Tiempo real ───────────────────────────────────────────
  private onRealtime(event: string, data: any) {
    switch (event) {
      case 'new_message': {
        const id = data?.conversationId, msg = data?.message as Message | undefined;
        if (!id || !msg) break;
        const known = this.conversations().some((c) => c.id === id);
        if (!known) { this.loadConversations(false); break; }
        const selected = this.selectedConv()?.id === id;
        if (selected) { this.appendMessage(id, msg); if (msg.sender === 'customer') this.api.markRead(id).subscribe({ error: () => {} }); }
        this.conversations.update((list) => this.sortByRecent(list.map((c) => c.id === id
          ? { ...c, lastMessagePreview: msg.content, lastMessageAt: msg.createdAt, unreadCount: !selected && msg.sender === 'customer' ? c.unreadCount + 1 : c.unreadCount }
          : c)));
        break;
      }
      case 'conversation_updated': if (data?.conversationId) this.patch(data.conversationId, { status: data.status, unreadCount: this.selectedConv()?.id === data.conversationId ? 0 : data.unreadCount }); break;
      case 'human_intervention': if (data?.conversationId) this.patch(data.conversationId, { status: 'human' }); break;
      case 'agent_resumed': if (data?.conversationId) this.patch(data.conversationId, { status: 'bot' }); break;
      case 'contact_stage_changed': this.loadConversations(false); break;
    }
  }

  private appendMessage(convId: string, msg: Message) {
    if (this.selectedConv()?.id !== convId) return;
    this.messages.update((l) => (l.some((m) => m.id === msg.id) ? l : [...l, msg]));
    this.scrollBottom();
  }

  private patch(id: string, changes: Partial<Conversation>) {
    this.conversations.update((list) => list.map((c) => (c.id === id ? { ...c, ...changes } : c)));
    const sel = this.selectedConv();
    if (sel?.id === id) this.selectedConv.set({ ...sel, ...changes });
  }

  private sortByRecent(list: Conversation[]) { return [...list].sort((a, b) => +new Date(b.lastMessageAt) - +new Date(a.lastMessageAt)); }

  private scrollBottom() { setTimeout(() => { const el = this.viewport?.nativeElement; if (el) el.scrollTop = el.scrollHeight; }, 30); }

  private dayLabel(d: Date) {
    const today = new Date(), y = new Date(Date.now() - 86400000);
    if (d.toDateString() === today.toDateString()) return 'Hoy';
    if (d.toDateString() === y.toDateString()) return 'Ayer';
    return d.toLocaleDateString('es', { day: 'numeric', month: 'long' });
  }

  senderLabel(m: Message): string {
    if (m.sender === 'agent') return 'Equipo';
    if (m.sender === 'bot') return m.automated ? 'Automático' : 'Relay IA';
    return m.sender === 'system' ? 'Sistema' : 'Cliente';
  }

  statusLabel(s: string) { return s === 'bot' ? 'IA activa' : s === 'human' ? 'Humano' : 'Resuelta'; }
}
