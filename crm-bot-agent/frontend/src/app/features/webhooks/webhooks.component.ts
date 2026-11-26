import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { UiService } from '../../core/ui/ui.service';
import { errMsg } from '../../core/ui/errors';

const EVENT_LABELS: Record<string, string> = {
  'message.received': 'Mensaje entrante de WhatsApp recibido',
  'message.sent': 'Mensaje saliente (IA o equipo) enviado',
  'contact.created': 'Nuevo lead o contacto registrado',
  'contact.updated': 'Contacto actualizado',
  'lead.stage_changed': 'Cambio de etapa en el embudo (Kanban)',
  'contact.status_changed': 'Cambio de estado del contacto',
  'appointment.created': 'Nueva cita agendada',
  'appointment.updated': 'Cita modificada',
  'stock.updated': 'Movimiento de inventario',
  'stock.low': 'Producto en stock bajo o agotado',
};

interface Form { id?: string; name: string; url: string; events: string[]; isActive: boolean }

@Component({
  selector: 'app-webhooks',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './webhooks.component.html',
  styleUrls: ['./webhooks.component.scss'],
})
export class WebhooksComponent implements OnInit {
  private api = inject(ApiService);
  private ui = inject(UiService);

  webhooks = signal<any[]>([]);
  loading = signal(true);
  showModal = signal(false);
  saving = signal(false);
  formError = signal('');
  testResult = signal<any | null>(null);
  testingId = signal<string | null>(null);
  revealed = signal<Set<string>>(new Set());
  availableEvents = signal<{ id: string; label: string }[]>(Object.entries(EVENT_LABELS).map(([id, label]) => ({ id, label })));
  form: Form = { name: '', url: '', events: [], isActive: true };

  ngOnInit() {
    this.loadWebhooks();
    this.api.getWebhookEvents().subscribe({ next: (ev) => this.availableEvents.set(ev.map((id) => ({ id, label: EVENT_LABELS[id] ?? id }))), error: () => {} });
  }

  loadWebhooks() {
    this.api.getWebhooks().subscribe({
      next: (data) => { this.webhooks.set(data ?? []); this.loading.set(false); },
      error: (e) => { this.loading.set(false); this.ui.error(errMsg(e, 'No se pudieron cargar los webhooks')); },
    });
  }

  openCreateModal() { this.form = { name: '', url: '', events: ['message.received', 'appointment.created'], isActive: true }; this.formError.set(''); this.showModal.set(true); }
  openEdit(w: any) { this.form = { id: w.id, name: w.name, url: w.url, events: [...(w.events ?? [])], isActive: w.isActive }; this.formError.set(''); this.showModal.set(true); }

  isEventSelected(id: string) { return this.form.events.includes(id); }
  toggleEvent(id: string) { this.form.events = this.isEventSelected(id) ? this.form.events.filter((e) => e !== id) : [...this.form.events, id]; }

  saveWebhook() {
    const f = this.form;
    if (!f.name.trim()) { this.formError.set('Ponle un nombre al webhook.'); return; }
    let url: URL | null = null;
    try { url = new URL(f.url.trim()); } catch { /* inválida */ }
    if (!url || !/^https?:$/.test(url.protocol)) { this.formError.set('La URL debe empezar por http:// o https://'); return; }
    if (!f.events.length) { this.formError.set('Selecciona al menos un evento.'); return; }
    const body = { name: f.name.trim(), url: f.url.trim(), events: f.events, isActive: f.isActive };
    this.saving.set(true); this.formError.set('');
    (f.id ? this.api.updateWebhook(f.id, body) : this.api.createWebhook(body)).subscribe({
      next: () => { this.saving.set(false); this.showModal.set(false); this.ui.success(f.id ? 'Webhook actualizado' : 'Webhook creado'); this.loadWebhooks(); },
      error: (e) => { this.saving.set(false); this.formError.set(errMsg(e, 'No se pudo guardar el webhook')); },
    });
  }

  toggleActive(w: any) {
    this.api.toggleWebhook(w.id).subscribe({
      next: () => this.webhooks.update((l) => l.map((x) => (x.id === w.id ? { ...x, isActive: !x.isActive } : x))),
      error: (e) => this.ui.error(errMsg(e)),
    });
  }

  testPing(w: any) {
    this.testingId.set(w.id); this.testResult.set(null);
    this.api.testWebhook(w.id).subscribe({
      next: (res) => { this.testingId.set(null); this.testResult.set({ ...res, name: w.name }); this.loadWebhooks(); },
      error: (e) => { this.testingId.set(null); this.ui.error(errMsg(e, 'No se pudo enviar la prueba')); },
    });
  }

  async deleteWebhook(w: any) {
    if (!(await this.ui.confirm(`Se eliminará "${w.name}". Dejará de recibir eventos.`, { title: 'Eliminar webhook', confirmLabel: 'Eliminar' }))) return;
    this.api.deleteWebhook(w.id).subscribe({ next: () => { this.ui.success('Webhook eliminado'); this.loadWebhooks(); }, error: (e) => this.ui.error(errMsg(e)) });
  }

  // El secreto de firma lo genera el servidor; se muestra oculto y se puede copiar.
  isRevealed(id: string) { return this.revealed().has(id); }
  reveal(id: string) { this.revealed.update((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  copySecret(w: any) { navigator.clipboard?.writeText(w.secret).then(() => this.ui.success('Secreto copiado'), () => this.ui.error('No se pudo copiar')); }

  ok(status: number) { return status >= 200 && status < 300; }
  label(id: string) { return EVENT_LABELS[id] ?? id; }
}
