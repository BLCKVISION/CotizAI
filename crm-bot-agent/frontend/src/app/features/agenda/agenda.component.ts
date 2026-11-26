import { Component, OnDestroy, OnInit, AfterViewInit, ElementRef, computed, inject, signal } from '@angular/core';
import { gsap } from 'gsap';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription, debounceTime } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { RealtimeService } from '../../core/services/realtime.service';
import { UiService } from '../../core/ui/ui.service';
import { errMsg } from '../../core/ui/errors';

type Status = 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
const STATUS_LABEL: Record<string, string> = { scheduled: 'Pendiente', confirmed: 'Confirmada', completed: 'Completada', cancelled: 'Cancelada', no_show: 'No asistió' };

interface Form { id?: string; contactId: string; contactName: string; contactPhone: string; service: string; scheduledAt: string; googleMeetLink: string; notes: string; status: Status }

const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

@Component({
  selector: 'app-agenda',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './agenda.component.html',
  styleUrls: ['./agenda.component.scss'],
})
export class AgendaComponent implements OnInit, AfterViewInit, OnDestroy {
  private el = inject(ElementRef);
  private ctx?: gsap.Context;
  private api = inject(ApiService);
  private ui = inject(UiService);
  private realtime = inject(RealtimeService);
  private sub?: Subscription;

  appointments = signal<any[]>([]);
  contacts = signal<{ id: string; name: string; phone: string }[]>([]);
  loading = signal(true);
  loadError = signal(false);
  statusFilter = signal<string>('all');
  viewMode = signal<'lista' | 'semana' | 'mes'>('lista');
  cursor = signal<Date>(startOfDay(new Date()));
  showModal = signal(false);
  saving = signal(false);
  formError = signal('');
  form: Form = this.blank();
  statusLabel = STATUS_LABEL;
  statuses: Status[] = ['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'];
  weekDays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  private active = (a: any) => a.status !== 'cancelled';
  private date = (a: any) => new Date(a.scheduledAt);

  kpiHoy = computed(() => this.appointments().filter((a) => this.active(a) && sameDay(this.date(a), new Date())).length);
  kpiSemana = computed(() => { const s = this.weekStart(new Date()), e = new Date(+s + 7 * 86400000); return this.appointments().filter((a) => this.active(a) && this.date(a) >= s && this.date(a) < e).length; });
  kpiPendientes = computed(() => this.appointments().filter((a) => a.status === 'scheduled').length);
  kpiConfirmadas = computed(() => this.appointments().filter((a) => a.status === 'confirmed').length);

  filtered = computed(() => {
    const f = this.statusFilter();
    return [...this.appointments()].filter((a) => f === 'all' || a.status === f).sort((a, b) => +this.date(a) - +this.date(b));
  });

  /** Vista lista: próximas primero y, debajo, las pasadas. */
  upcoming = computed(() => this.filtered().filter((a) => +this.date(a) >= +startOfDay(new Date())));
  past = computed(() => this.filtered().filter((a) => +this.date(a) < +startOfDay(new Date())).reverse());

  weekDates = computed(() => { const s = this.weekStart(this.cursor()); return Array.from({ length: 7 }, (_, i) => new Date(+s + i * 86400000)); });
  monthCells = computed(() => {
    const c = this.cursor(), first = new Date(c.getFullYear(), c.getMonth(), 1), start = this.weekStart(first);
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(+start + i * 86400000); return { d, other: d.getMonth() !== c.getMonth() }; });
  });
  title = computed(() => {
    const c = this.cursor();
    if (this.viewMode() === 'mes') return c.toLocaleDateString('es', { month: 'long', year: 'numeric' });
    if (this.viewMode() === 'semana') { const w = this.weekDates(); return `${w[0].toLocaleDateString('es', { day: 'numeric', month: 'short' })} – ${w[6].toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}`; }
    return 'Todas las citas';
  });

  ngOnInit() {
    this.load();
    this.api.getContacts({ limit: 100 }).subscribe({ next: (r) => this.contacts.set(r?.data ?? []), error: () => {} });
    this.sub = this.realtime.events$.pipe(debounceTime(600)).subscribe((e) => { if (e.event === 'appointment_booked' || e.event === 'crm') this.load(false); });
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

    tl.from('.kpi-grid .kpi-card', {
      y: 18,
      autoAlpha: 0,
      duration: 0.45,
      stagger: 0.06,
      ease: 'power3.out',
      clearProps: 'all',
    }, 0.08);

    tl.from('.agenda-toolbar-row', {
      y: 14,
      autoAlpha: 0,
      duration: 0.4,
      clearProps: 'all',
    }, 0.16);

    tl.from('.agenda-main-card', {
      y: 20,
      autoAlpha: 0,
      duration: 0.5,
      clearProps: 'all',
    }, 0.22);

    tl.from('.agenda-table tbody tr, .week-col, .month-day-cell', {
      y: 10,
      autoAlpha: 0,
      duration: 0.35,
      stagger: 0.02,
      ease: 'power2.out',
      clearProps: 'all',
    }, 0.28);
  }

  animateViewChange() {
    setTimeout(() => {
      this.ctx?.add(() => {
        gsap.from('.agenda-table tbody tr, .week-col, .month-day-cell', {
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
    this.sub?.unsubscribe();
    this.ctx?.revert();
  }

  load(spinner = true) {
    if (spinner) this.loading.set(true);
    this.api.getAppointments().subscribe({
      next: (data) => { this.appointments.set(data || []); this.loading.set(false); this.loadError.set(false); },
      error: () => { this.loading.set(false); this.loadError.set(true); },
    });
  }

  on(list: any[], d: Date) { return list.filter((a) => sameDay(this.date(a), d)); }
  forDay(d: Date) { return this.on(this.filtered(), d); }

  private weekStart(d: Date) { const s = startOfDay(d), dow = (s.getDay() + 6) % 7; return new Date(+s - dow * 86400000); }
  isToday(d: Date) { return sameDay(d, new Date()); }

  shift(dir: -1 | 1) {
    const c = this.cursor();
    this.cursor.set(this.viewMode() === 'mes' ? new Date(c.getFullYear(), c.getMonth() + dir, 1) : new Date(+c + dir * 7 * 86400000));
  }
  today() { this.cursor.set(startOfDay(new Date())); }

  // ── Alta / edición ────────────────────────────────────────
  private blank(): Form { return { contactId: '', contactName: '', contactPhone: '', service: '', scheduledAt: toLocalInput(new Date(Date.now() + 86400000)), googleMeetLink: '', notes: '', status: 'scheduled' }; }

  openCreateModal(day?: Date) {
    this.form = this.blank();
    if (day) { const d = new Date(day); d.setHours(10, 0, 0, 0); this.form.scheduledAt = toLocalInput(d); }
    this.formError.set(''); this.showModal.set(true);
  }

  openEdit(a: any) {
    this.form = { id: a.id, contactId: a.contactId ?? a.contact?.id ?? '', contactName: '', contactPhone: '', service: a.service ?? a.title ?? '', scheduledAt: toLocalInput(new Date(a.scheduledAt)), googleMeetLink: a.googleMeetLink ?? '', notes: a.notes ?? '', status: a.status };
    this.formError.set(''); this.showModal.set(true);
  }

  save() {
    const f = this.form;
    if (!f.contactId && !f.contactName.trim()) { this.formError.set('Elige un cliente o escribe el nombre de uno nuevo.'); return; }
    if (!f.contactId && f.contactPhone && !/^\+?[0-9 ()-]{7,20}$/.test(f.contactPhone.trim())) { this.formError.set('El teléfono no es válido.'); return; }
    if (!f.scheduledAt || isNaN(+new Date(f.scheduledAt))) { this.formError.set('Indica la fecha y hora de la cita.'); return; }
    if (f.googleMeetLink && !/^https?:\/\//.test(f.googleMeetLink)) { this.formError.set('El enlace de la videollamada debe empezar por http(s)://'); return; }
    const body: any = { scheduledAt: new Date(f.scheduledAt).toISOString(), service: f.service.trim(), notes: f.notes, googleMeetLink: f.googleMeetLink.trim(), status: f.status };
    if (f.contactId) body.contactId = f.contactId; else { body.contactName = f.contactName.trim(); if (f.contactPhone) body.contactPhone = f.contactPhone.trim(); }
    this.saving.set(true); this.formError.set('');
    (f.id ? this.api.updateAppointment(f.id, body) : this.api.createAppointment(body)).subscribe({
      next: () => { this.saving.set(false); this.showModal.set(false); this.ui.success(f.id ? 'Cita actualizada' : 'Cita agendada'); this.load(false); },
      error: (e) => { this.saving.set(false); this.formError.set(errMsg(e, 'No se pudo guardar la cita')); },
    });
  }

  setStatus(a: any, status: Status) {
    this.api.updateAppointmentStatus(a.id, status).subscribe({
      next: () => { this.appointments.update((l) => l.map((x) => (x.id === a.id ? { ...x, status } : x))); this.ui.success(`Cita ${STATUS_LABEL[status].toLowerCase()}`); },
      error: (e) => this.ui.error(errMsg(e)),
    });
  }

  async remove(a: any) {
    if (!(await this.ui.confirm('La cita se eliminará definitivamente.', { title: 'Eliminar cita', confirmLabel: 'Eliminar' }))) return;
    this.api.deleteAppointment(a.id).subscribe({ next: () => { this.ui.success('Cita eliminada'); this.load(false); }, error: (e) => this.ui.error(errMsg(e)) });
  }

  chip(status: string) { return { scheduled: 'pending', confirmed: 'confirmed', completed: 'completed', cancelled: 'cancelled', no_show: 'cancelled' }[status] ?? 'pending'; }
}
