import { Component, OnDestroy, OnInit, AfterViewInit, ElementRef, computed, inject, signal } from '@angular/core';
import { gsap } from 'gsap';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, debounceTime } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { RealtimeService } from '../../core/services/realtime.service';
import { UiService } from '../../core/ui/ui.service';
import { errMsg } from '../../core/ui/errors';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface StageInfo { id: string; label: string; color: string }

const STAGES: StageInfo[] = [
  { id: 'nuevo', label: 'Nuevos', color: '#3b82f6' },
  { id: 'contactado', label: 'Contactados', color: '#06b6d4' },
  { id: 'calificado', label: 'Calificados', color: '#10b981' },
  { id: 'interesado', label: 'Interesados', color: '#f59e0b' },
  { id: 'negociacion', label: 'Negociación', color: '#f97316' },
  { id: 'cerrado', label: 'Cerrados', color: '#16a34a' },
  { id: 'perdido', label: 'Perdidos', color: '#ef4444' },
];

interface ContactForm { id?: string; name: string; phone: string; email: string; stage: string; score: number; notes: string; tagsText: string }
const blank = (): ContactForm => ({ name: '', phone: '', email: '', stage: 'nuevo', score: 0, notes: '', tagsText: '' });

@Component({
  selector: 'app-crm',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './crm.component.html',
  styleUrls: ['./crm.component.scss'],
})
export class CrmComponent implements OnInit, AfterViewInit, OnDestroy {
  private el = inject(ElementRef);
  private ctx?: gsap.Context;
  private api = inject(ApiService);
  private ui = inject(UiService);
  private http = inject(HttpClient);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private realtime = inject(RealtimeService);
  private subs: Subscription[] = [];

  stages = STAGES;
  pipeline = signal<Record<string, any[]>>({});
  loading = signal(true);
  loadError = signal(false);
  viewMode = signal<'tabla' | 'kanban'>('tabla');
  selectedFilter = signal<string>('todos');
  tagFilter = signal<string>('');
  searchQuery = signal<string>('');
  showModal = signal(false);
  saving = signal(false);
  formError = signal('');
  form: ContactForm = blank();
  draggedContact: { contact: any; sourceStage: string } | null = null;

  ngOnInit() {
    this.subs.push(this.route.queryParamMap.subscribe((q) => { if (q.has('q')) this.searchQuery.set(q.get('q') ?? ''); }));
    this.loadPipeline();
    this.subs.push(this.realtime.events$.pipe(debounceTime(800)).subscribe((e) => {
      if (['contact_stage_changed', 'conversation_updated', 'human_intervention', 'new_message', 'crm'].includes(e.event)) this.loadPipeline(false);
    }));
  }

  ngAfterViewInit() {
    this.ctx = gsap.context(() => {
      this.animateEntrance();
    }, this.el.nativeElement);
  }

  animateEntrance() {
    const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });

    tl.from('.page-top-header', {
      y: 16,
      autoAlpha: 0,
      duration: 0.45,
      clearProps: 'all',
    }, 0);

    tl.from('.filter-controls-bar .stage-pill', {
      y: 12,
      autoAlpha: 0,
      duration: 0.4,
      stagger: 0.03,
      ease: 'power2.out',
      clearProps: 'all',
    }, 0.08);

    tl.from('.table-card', {
      y: 18,
      autoAlpha: 0,
      duration: 0.45,
      clearProps: 'all',
    }, 0.14);

    tl.from('.crm-table tbody tr', {
      y: 10,
      autoAlpha: 0,
      duration: 0.35,
      stagger: 0.025,
      ease: 'power2.out',
      clearProps: 'all',
    }, 0.2);

    tl.from('.kanban-col', {
      y: 18,
      autoAlpha: 0,
      duration: 0.45,
      stagger: 0.04,
      ease: 'power2.out',
      clearProps: 'all',
    }, 0.16);

    tl.from('.kanban-card', {
      scale: 0.96,
      autoAlpha: 0,
      duration: 0.35,
      stagger: 0.02,
      ease: 'power2.out',
      clearProps: 'all',
    }, 0.24);
  }

  animateViewChange() {
    setTimeout(() => {
      this.ctx?.add(() => {
        gsap.from('.crm-table tbody tr, .kanban-card', {
          y: 10,
          autoAlpha: 0,
          duration: 0.3,
          stagger: 0.02,
          ease: 'power2.out',
          clearProps: 'all',
        });
      });
    }, 30);
  }

  ngOnDestroy() {
    this.subs.forEach((s) => s.unsubscribe());
    this.ctx?.revert();
  }

  loadPipeline(spinner = true) {
    if (spinner) this.loading.set(true);
    this.api.getPipeline().subscribe({
      next: (data) => { this.pipeline.set(data || {}); this.loading.set(false); this.loadError.set(false); },
      error: () => { this.loading.set(false); this.loadError.set(true); },
    });
  }

  totalCount = computed(() => Object.values(this.pipeline()).reduce((s, l) => s + (l?.length ?? 0), 0));
  getStageCount(stageId: string) { return (this.pipeline()[stageId] || []).length; }

  allTags = computed(() => {
    const t = new Set<string>();
    for (const l of Object.values(this.pipeline())) for (const c of l ?? []) for (const x of c.tags ?? []) t.add(x);
    return [...t].sort();
  });

  private matches(c: any) {
    const q = this.searchQuery().toLowerCase().trim();
    const tag = this.tagFilter();
    if (tag && !(c.tags ?? []).includes(tag)) return false;
    if (!q) return true;
    return [c.name, c.phone, c.email].some((v) => v && String(v).toLowerCase().includes(q));
  }

  allContacts = computed(() => {
    const p = this.pipeline(), filter = this.selectedFilter();
    const list: any[] = [];
    for (const [stg, contacts] of Object.entries(p)) {
      if (filter !== 'todos' && filter !== stg) continue;
      list.push(...(contacts || []).map((c) => ({ ...c, stage: stg })));
    }
    return list.filter((c) => this.matches(c));
  });

  getList(stageId: string): any[] { return (this.pipeline()[stageId] || []).filter((c) => this.matches(c)); }
  getStageLabel(id: string) { return STAGES.find((s) => s.id === id)?.label || id; }
  getStageColor(id: string) { return STAGES.find((s) => s.id === id)?.color || '#6b7280'; }

  // ── Alta / edición ────────────────────────────────────────
  openCreateModal() { this.form = blank(); this.formError.set(''); this.showModal.set(true); }
  openEdit(c: any) {
    this.form = { id: c.id, name: c.name ?? '', phone: c.phone ?? '', email: c.email ?? '', stage: c.stage, score: c.score ?? 0, notes: c.notes ?? '', tagsText: (c.tags ?? []).join(', ') };
    this.formError.set(''); this.showModal.set(true);
  }

  private validate(): string {
    const f = this.form;
    if (f.name.trim().length < 2) return 'El nombre es obligatorio (mínimo 2 caracteres).';
    if (f.phone && !/^\+?[0-9 ()-]{7,20}$/.test(f.phone.trim())) return 'El teléfono no es válido (ej. +58 412 1234567).';
    if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) return 'El correo electrónico no es válido.';
    if (f.score < 0 || f.score > 100) return 'El score debe estar entre 0 y 100.';
    return '';
  }

  saveContact() {
    const err = this.validate();
    if (err) { this.formError.set(err); return; }
    const f = this.form;
    const body = {
      name: f.name.trim(), phone: f.phone.trim(), email: f.email.trim(), stage: f.stage, score: Math.round(f.score) || 0, notes: f.notes,
      tags: f.tagsText.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 20),
    };
    this.saving.set(true); this.formError.set('');
    (f.id ? this.api.updateContact(f.id, body) : this.api.createContact(body)).subscribe({
      next: () => { this.saving.set(false); this.showModal.set(false); this.ui.success(f.id ? 'Contacto actualizado' : 'Contacto creado'); this.loadPipeline(false); },
      error: (e) => { this.saving.set(false); this.formError.set(errMsg(e, 'No se pudo guardar el contacto')); },
    });
  }

  async remove(c: any) {
    if (!(await this.ui.confirm(`Se eliminará a ${c.name} junto con su historial de conversación.`, { title: 'Eliminar contacto', confirmLabel: 'Eliminar' }))) return;
    this.api.deleteContact(c.id).subscribe({ next: () => { this.ui.success('Contacto eliminado'); this.loadPipeline(false); }, error: (e) => this.ui.error(errMsg(e)) });
  }

  openChat(c: any) { this.router.navigate(['/conversations'], { queryParams: { contact: c.id } }); }

  // ── Importar / exportar CSV ───────────────────────────────
  exportContacts() {
    this.http.get(`${environment.apiUrl}/v1/contacts/export`, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = `clientes-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
        URL.revokeObjectURL(a.href);
      },
      error: (e) => this.ui.error(errMsg(e, 'No se pudo exportar')),
    });
  }

  importContacts(ev: Event) {
    const input = ev.target as HTMLInputElement, file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > 2_000_000) { this.ui.error('El archivo supera los 2 MB.'); return; }
    file.text().then((text) => {
      const rows = this.parseCsv(text);
      if (!rows.length) { this.ui.error('No se encontraron filas válidas. Usa columnas: nombre, telefono, email.'); return; }
      this.api.importContacts(rows).subscribe({
        next: (r: any) => { this.ui.success(`${r.imported} contactos importados`); this.loadPipeline(false); },
        error: (e: any) => this.ui.error(errMsg(e, 'No se pudo importar')),
      });
    });
  }

  private parseCsv(text: string) {
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];
    const sep = lines[0].includes(';') ? ';' : ',';
    const split = (l: string) => l.split(sep).map((x) => x.trim().replace(/^"|"$/g, ''));
    const head = split(lines[0]).map((h) => h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
    const col = (names: string[]) => head.findIndex((h) => names.includes(h));
    const [iN, iP, iE] = [col(['nombre', 'name']), col(['telefono', 'phone', 'celular']), col(['email', 'correo'])];
    if (iN < 0) return [];
    return lines.slice(1).map(split).filter((r) => r[iN]).slice(0, 5000).map((r) => ({ name: r[iN], phone: iP >= 0 ? r[iP] : '', email: iE >= 0 ? r[iE] : '' }));
  }

  // ── Arrastrar y soltar (kanban) ───────────────────────────
  onDragStart(event: DragEvent, contact: any, sourceStage: string) {
    this.draggedContact = { contact, sourceStage };
    event.dataTransfer?.setData('text/plain', contact.id);
  }
  onDragOver(event: DragEvent) { event.preventDefault(); }

  onDrop(event: DragEvent, targetStage: string) {
    event.preventDefault();
    if (!this.draggedContact) return;
    const { contact, sourceStage } = this.draggedContact;
    this.draggedContact = null;
    if (sourceStage === targetStage) return;
    const before = this.pipeline();
    const next = { ...before };
    next[sourceStage] = (before[sourceStage] || []).filter((c) => c.id !== contact.id);
    next[targetStage] = [...(before[targetStage] || []), { ...contact, stage: targetStage }];
    this.pipeline.set(next);
    this.api.moveContact(contact.id, targetStage).subscribe({
      error: (e) => { this.pipeline.set(before); this.ui.error(errMsg(e, 'No se pudo mover el contacto')); },
    });
  }
}
