import { Component, OnInit, AfterViewInit, OnDestroy, ElementRef, computed, inject, signal } from '@angular/core';
import { gsap } from 'gsap';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { UiService } from '../../core/ui/ui.service';
import { errMsg } from '../../core/ui/errors';

type Tab = 'leads' | 'mensajes' | 'citas';
const STAGE_COLOR: Record<string, string> = { nuevo: '#3b82f6', contactado: '#06b6d4', calificado: '#10b981', interesado: '#f59e0b', negociacion: '#f97316', cerrado: '#16a34a', perdido: '#ef4444' };
const SOURCE_LABEL: Record<string, string> = { whatsapp: 'WhatsApp', manual: 'Manual', importado: 'Importados', agenda: 'Agenda', meta_ad: 'Anuncios Meta' };

@Component({
  selector: 'app-reportes',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './reportes.component.html',
  styleUrls: ['./reportes.component.scss'],
})
export class ReportesComponent implements OnInit, AfterViewInit, OnDestroy {
  private el = inject(ElementRef);
  private ctx?: gsap.Context;
  private api = inject(ApiService);
  private ui = inject(UiService);

  period = signal<'7' | '30' | '90'>('30');
  activeMetricTab = signal<Tab>('leads');
  showRawDataModal = signal(false);
  loading = signal(true);
  loadError = signal(false);
  data = signal<any | null>(null);
  hours24 = Array.from({ length: 24 }, (_, i) => i);

  funnel = computed(() => (this.data()?.funnel ?? []).map((f: any) => ({ name: f.name, count: f.count, color: STAGE_COLOR[f.stage] ?? '#64748b' })));
  sources = computed(() => (this.data()?.sources ?? []).map((s: any) => ({ ...s, label: SOURCE_LABEL[s.source] ?? s.source, pct: s.leads ? Math.round((s.closed / s.leads) * 100) : 0 })));
  maxHour = computed(() => Math.max(1, ...(this.data()?.hours ?? [0])));
  peakHour = computed(() => { const h = this.data()?.peakHour; return h === null || h === undefined ? '—' : `${String(h).padStart(2, '0')}:00`; });

  series = computed(() => {
    const t = this.data()?.timeline, key = ({ leads: 'leads', mensajes: 'messages', citas: 'appointments' } as const)[this.activeMetricTab()];
    const pts: { date: string; value: number }[] = t?.[key] ?? [];
    const max = Math.max(1, ...pts.map((p) => p.value));
    const step = pts.length > 1 ? 840 / (pts.length - 1) : 0;
    const path = pts.map((p, i) => `${i ? 'L' : 'M'} ${(40 + i * step).toFixed(1)} ${(120 - (p.value / max) * 100).toFixed(1)}`).join(' ');
    const every = Math.max(1, Math.ceil(pts.length / 10));
    const labels = pts.filter((_, i) => i % every === 0).map((p) => { const d = new Date(p.date + 'T12:00:00'); return isNaN(+d) ? p.date : d.toLocaleDateString('es', { day: '2-digit', month: 'short' }); });
    return { path, max, labels, total: pts.reduce((s, p) => s + p.value, 0) };
  });

  ngOnInit() { this.load(); }

  ngAfterViewInit() {
    this.ctx = gsap.context(() => {
      this.animateEntrance();
    }, this.el.nativeElement);
  }

  animateEntrance() {
    const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });

    tl.from('.page-header', {
      y: 16,
      autoAlpha: 0,
      duration: 0.45,
      clearProps: 'all',
    }, 0);

    tl.from('.report-kpis .kpi-card', {
      y: 20,
      autoAlpha: 0,
      duration: 0.45,
      stagger: 0.06,
      ease: 'power3.out',
      clearProps: 'all',
    }, 0.08);

    tl.from('.dash-card.funnel-card', {
      y: 20,
      autoAlpha: 0,
      duration: 0.5,
      clearProps: 'all',
    }, 0.16);

    tl.from('.funnel-row', {
      x: 14,
      autoAlpha: 0,
      duration: 0.4,
      stagger: 0.045,
      ease: 'power2.out',
      clearProps: 'all',
    }, 0.22);

    tl.from('.dash-card.kpi-indicators-card', {
      y: 20,
      autoAlpha: 0,
      duration: 0.5,
      clearProps: 'all',
    }, 0.18);

    tl.from('.indicator-row', {
      x: 14,
      autoAlpha: 0,
      duration: 0.4,
      stagger: 0.05,
      ease: 'power2.out',
      clearProps: 'all',
    }, 0.24);

    tl.from('.dash-card.sources-card', {
      y: 20,
      autoAlpha: 0,
      duration: 0.5,
      clearProps: 'all',
    }, 0.22);

    tl.from('.source-row', {
      x: 14,
      autoAlpha: 0,
      duration: 0.4,
      stagger: 0.045,
      ease: 'power2.out',
      clearProps: 'all',
    }, 0.28);

    tl.from('.dash-card.hourly-card', {
      y: 20,
      autoAlpha: 0,
      duration: 0.5,
      clearProps: 'all',
    }, 0.24);

    tl.from('.heatmap-cell', {
      scale: 0.8,
      autoAlpha: 0,
      duration: 0.35,
      stagger: 0.015,
      ease: 'back.out(1.2)',
      clearProps: 'all',
    }, 0.3);
  }

  animatePeriodChange() {
    this.ctx?.add(() => {
      gsap.fromTo('.kpi-value, .ind-value',
        { scale: 0.88, opacity: 0.4 },
        { scale: 1, opacity: 1, duration: 0.35, stagger: 0.03, ease: 'power2.out', clearProps: 'all' }
      );
      gsap.fromTo('.source-fill-bar',
        { width: 0 },
        { width: (i, target) => target.style.width, duration: 0.5, stagger: 0.04, ease: 'power2.out', clearProps: 'width' }
      );
    });
  }

  ngOnDestroy() {
    this.ctx?.revert();
  }

  load() {
    this.loading.set(true);
    this.api.getReportsSummary(this.period()).subscribe({
      next: (d) => { this.data.set(d); this.loading.set(false); this.loadError.set(false); },
      error: () => { this.loading.set(false); this.loadError.set(true); },
    });
  }

  setPeriod(p: '7' | '30' | '90') { this.period.set(p); this.load(); this.animatePeriodChange(); }
  setTab(tab: Tab) { this.activeMetricTab.set(tab); }
  viewRawData() { this.showRawDataModal.set(true); }
  hourColor(i: number) { const v = (this.data()?.hours?.[i] ?? 0) / this.maxHour(); return v ? `rgba(59,130,246,${(0.18 + v * 0.8).toFixed(2)})` : ''; }

  downloadCsv() {
    const d = this.data();
    if (!d) return;
    const rows: (string | number)[][] = [['fecha', 'leads', 'mensajes', 'citas']];
    const t = d.timeline;
    (t?.leads ?? []).forEach((p: any, i: number) => rows.push([p.date, p.value, t.messages?.[i]?.value ?? 0, t.appointments?.[i]?.value ?? 0]));
    const csv = rows.map((r) => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `reporte-${this.period()}d.csv`; a.click(); URL.revokeObjectURL(a.href);
    this.ui.success('Reporte descargado');
  }

  rawJson() { return JSON.stringify(this.data(), null, 2); }
  err = errMsg;
}
