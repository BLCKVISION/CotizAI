import {
  Component, OnDestroy, OnInit, AfterViewInit, ElementRef,
  computed, inject, signal
} from '@angular/core';
import { gsap } from 'gsap';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Subscription, debounceTime, forkJoin, of, catchError } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { RealtimeService } from '../../core/services/realtime.service';
import { ThemeService } from '../../core/services/theme.service';

export interface ActivityBar {
  day: string;
  value: number;
  heightPct: number;
  active: boolean;
  aiMessages: number;
  clientMessages: number;
}

export interface CrmTask {
  id: string;
  leadName: string;
  action: string;
  stage: string;
  time: string;
  priority: 'Hoy' | 'Urgente' | 'Pendiente' | 'Post-demo';
  priorityTheme: 'emerald' | 'amber' | 'rose' | 'blue';
  completed: boolean;
  route: string;
}

export interface PendingItem {
  id: string;
  title: string;
  subtitle: string;
  count?: number;
  hasArrow?: boolean;
  theme: 'amber' | 'emerald' | 'blue' | 'violet';
  route: string;
}

export interface BotMetricItem {
  id: 'resolution' | 'speed' | 'accuracy' | 'automation';
  label: string;
  shortLabel: string;
  value: string;
  numericPct: number;
  color: string;
  trackColor: string;
  glowColor: string;
}

export interface PipelineStageRow {
  id: string;
  label: string;
  count: number;
  progressPct: number;
  dotColor: string;
  barColor: string;
}

export interface DashboardStats {
  aiMessages: number;
  humanMessages: number;
  incomingMessages: number;
  newLeads: number;
  totalContacts: number;
  appointmentsPeriod: number;
  appointmentsToday: number;
  appointmentsWeek: number;
  automationRate: number;
  responseRate: number;
  interventions: number;
  lowStock: number;
}

const MOCK_STATS: DashboardStats = {
  aiMessages: 240,
  humanMessages: 35,
  incomingMessages: 275,
  newLeads: 130,
  totalContacts: 130,
  appointmentsPeriod: 13,
  appointmentsToday: 0,
  appointmentsWeek: 3,
  automationRate: 25,
  responseRate: 45,
  interventions: 2,
  lowStock: 4,
};

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  private el = inject(ElementRef);
  private ctx?: gsap.Context;
  private auth = inject(AuthService);
  private api = inject(ApiService);
  private realtime = inject(RealtimeService);
  private themeService = inject(ThemeService);
  private sub?: Subscription;

  currentUser = this.auth.currentUser;
  stats = signal<DashboardStats>(MOCK_STATS);
  loading = signal(false);
  period = signal<'7' | '30' | '90'>('7');
  activePendientesTab = signal<'resumen' | 'tareas'>('resumen');
  activeBotMetric = signal<'resolution' | 'speed' | 'accuracy' | 'automation'>('resolution');

  // Metricas interactivas y color dinamico para Rendimiento del Bot
  readonly botMetrics = computed<BotMetricItem[]>(() => {
    const isLight = this.themeService.currentTheme() === 'light';
    const resolutionColor = isLight ? '#d4f938' : '#22c55e';
    const resolutionTrack = isLight ? 'rgba(212, 249, 56, 0.18)' : 'rgba(34, 197, 94, 0.15)';
    const resolutionGlow = isLight ? 'rgba(212, 249, 56, 0.65)' : 'rgba(34, 197, 94, 0.45)';

    return [
      {
        id: 'resolution',
        label: 'Resolución IA',
        shortLabel: 'Resolución',
        value: '84%',
        numericPct: 84,
        color: resolutionColor,
        trackColor: resolutionTrack,
        glowColor: resolutionGlow,
      },
      {
        id: 'speed',
        label: 'Tiempo resp.',
        shortLabel: 'Velocidad',
        value: '1.2s',
        numericPct: 92,
        color: '#06b6d4',
        trackColor: 'rgba(6, 182, 212, 0.15)',
        glowColor: 'rgba(6, 182, 212, 0.55)',
      },
      {
        id: 'accuracy',
        label: 'Precisión',
        shortLabel: 'Precisión',
        value: '96.4%',
        numericPct: 96.4,
        color: '#8b5cf6',
        trackColor: 'rgba(139, 92, 246, 0.15)',
        glowColor: 'rgba(139, 92, 246, 0.55)',
      },
      {
        id: 'automation',
        label: 'Carga IA',
        shortLabel: 'Carga IA',
        value: `${this.stats().automationRate || 85}%`,
        numericPct: this.stats().automationRate || 85,
        color: '#f59e0b',
        trackColor: 'rgba(245, 158, 11, 0.15)',
        glowColor: 'rgba(245, 158, 11, 0.55)',
      },
    ];
  });

  readonly currentBotMetric = computed<BotMetricItem>(() => {
    return this.botMetrics().find((m) => m.id === this.activeBotMetric()) || this.botMetrics()[0];
  });

  selectBotMetric(id: 'resolution' | 'speed' | 'accuracy' | 'automation'): void {
    this.activeBotMetric.set(id);
  }

  // 5 Tarjetas Biseladas de Pendientes (Exactas a Imagen 2 de referencia)
  readonly pendingItems = computed<PendingItem[]>(() => [
    {
      id: 'human',
      title: 'Intervenciones humanas',
      subtitle: 'Clientes esperando atención manual',
      count: this.stats().interventions || 2,
      theme: 'amber',
      route: '/conversations',
    },
    {
      id: 'today',
      title: 'Citas hoy',
      subtitle: 'Pendientes o confirmadas para hoy',
      count: this.stats().appointmentsToday || 0,
      theme: 'emerald',
      route: '/agenda',
    },
    {
      id: 'week',
      title: 'Citas esta semana',
      subtitle: 'Confirmadas y pendientes',
      count: this.stats().appointmentsWeek || 3,
      theme: 'blue',
      route: '/agenda',
    },
    {
      id: 'stock',
      title: 'Stock bajo o agotado',
      subtitle: 'Productos en o bajo su mínimo',
      count: this.stats().lowStock || 4,
      theme: 'amber',
      route: '/productos',
    },
    {
      id: 'kb',
      title: 'Base de conocimiento',
      subtitle: 'Añade docs para mejorar al bot',
      hasArrow: true,
      theme: 'violet',
      route: '/conocimiento',
    },
  ]);

  // 9 Barras de actividad interactivas exactas de relay_saas_platform.ts
  readonly activityBars = signal<ActivityBar[]>([
    { day: 'L', value: 19, heightPct: 92, active: true, aiMessages: 148, clientMessages: 92 },
    { day: 'M', value: 11, heightPct: 54, active: false, aiMessages: 86, clientMessages: 54 },
    { day: 'M', value: 13, heightPct: 65, active: false, aiMessages: 104, clientMessages: 61 },
    { day: 'J', value: 15, heightPct: 76, active: false, aiMessages: 118, clientMessages: 70 },
    { day: 'V', value: 20, heightPct: 97, active: false, aiMessages: 162, clientMessages: 88 },
    { day: 'S', value: 10, heightPct: 51, active: false, aiMessages: 74, clientMessages: 42 },
    { day: 'D', value: 8, heightPct: 38, active: false, aiMessages: 52, clientMessages: 31 },
    { day: 'L', value: 14, heightPct: 70, active: false, aiMessages: 110, clientMessages: 64 },
    { day: 'M', value: 19, heightPct: 92, active: false, aiMessages: 144, clientMessages: 89 },
  ]);

  readonly selectedBar = computed(() => {
    return this.activityBars().find((b) => b.active) ?? this.activityBars()[0];
  });

  // 4 Filas de pipelines de leads (Manteniendo las etapas requeridas)
  readonly pipelineRows = signal<PipelineStageRow[]>([
    {
      id: 'nuevos',
      label: 'Nuevos leads',
      count: 48,
      progressPct: 68,
      dotColor: '#3b82f6',
      barColor: '#3b82f6',
    },
    {
      id: 'calificados',
      label: 'Calificados',
      count: 35,
      progressPct: 52,
      dotColor: '#10b981',
      barColor: '#10b981',
    },
    {
      id: 'interesados',
      label: 'Interesados',
      count: 28,
      progressPct: 40,
      dotColor: '#f59e0b',
      barColor: '#f59e0b',
    },
    {
      id: 'cerrados',
      label: 'Venta cerrada',
      count: 19,
      progressPct: 28,
      dotColor: '#22c55e',
      barColor: '#22c55e',
    },
  ]);

  // Tareas rápidas y recordatorios de seguimiento CRM asociados a Leads
  readonly crmTasks = signal<CrmTask[]>([
    {
      id: 'task-1',
      leadName: 'Sofia Gomez',
      action: 'Llamar para cierre de demostración guiada',
      stage: 'Calificados',
      time: '14:30',
      priority: 'Hoy',
      priorityTheme: 'emerald',
      completed: false,
      route: '/conversations',
    },
    {
      id: 'task-2',
      leadName: 'Carlos Rodriguez',
      action: 'Enviar cotización formal con tasa BCV',
      stage: 'Interesados',
      time: '16:00',
      priority: 'Urgente',
      priorityTheme: 'amber',
      completed: false,
      route: '/conversations',
    },
    {
      id: 'task-3',
      leadName: 'Valeria Marquez',
      action: 'Seguimiento post-demo y resolver dudas de plan',
      stage: 'Interesados',
      time: 'Mañana',
      priority: 'Post-demo',
      priorityTheme: 'blue',
      completed: false,
      route: '/conversations',
    },
    {
      id: 'task-4',
      leadName: 'Roberto Morales',
      action: 'Confirmar pago móvil / factura fiscal USD',
      stage: 'Venta cerrada',
      time: 'Pendiente',
      priority: 'Pendiente',
      priorityTheme: 'emerald',
      completed: false,
      route: '/conversations',
    },
    {
      id: 'task-5',
      leadName: 'Elena Ramos',
      action: 'Intervención manual: verificar stock especial',
      stage: 'Nuevos leads',
      time: '17:15',
      priority: 'Hoy',
      priorityTheme: 'rose',
      completed: false,
      route: '/conversations',
    },
  ]);

  toggleTask(id: string, event?: Event): void {
    if (event) event.stopPropagation();
    this.crmTasks.update((tasks) =>
      tasks.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
    );
  }

  getPendingIconClasses(theme: PendingItem['theme']): string {
    switch (theme) {
      case 'amber':
        return 'theme-amber';
      case 'emerald':
        return 'theme-emerald';
      case 'blue':
        return 'theme-blue';
      case 'violet':
        return 'theme-violet';
    }
  }

  // SVG Donut circumference for 39px radius (2 * PI * 39 ≈ 245)
  get circumference() { return 2 * Math.PI * 39; }

  get botRingOffset() {
    const pct = this.currentBotMetric().numericPct;
    return this.circumference - (pct / 100) * this.circumference;
  }

  get automationOffset() {
    return this.botRingOffset;
  }

  selectBar(index: number): void {
    this.activityBars.update((bars) =>
      bars.map((bar, i) => ({
        ...bar,
        active: i === index,
      }))
    );
  }

  incrementKpi(type: 'ai' | 'leads' | 'appointments' | 'rate'): void {
    this.stats.update((s) => {
      if (type === 'ai') return { ...s, aiMessages: s.aiMessages + 1 };
      if (type === 'leads') return { ...s, newLeads: s.newLeads + 1 };
      if (type === 'appointments') return { ...s, appointmentsPeriod: s.appointmentsPeriod + 1 };
      if (type === 'rate') return { ...s, responseRate: s.responseRate >= 95 ? 45 : s.responseRate + 5 };
      return s;
    });
  }


  ngAfterViewInit() {
    this.ctx = gsap.context(() => {
      this.animateEntrance();
    }, this.el.nativeElement);
  }

  animateEntrance() {
    const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });

    tl.from('.user-greeting, .dash-subtitle', {
      y: 16,
      autoAlpha: 0,
      duration: 0.45,
      stagger: 0.08,
      clearProps: 'all',
    }, 0);

    tl.from('.kpi-card', {
      y: 22,
      autoAlpha: 0,
      duration: 0.5,
      stagger: 0.07,
      ease: 'power3.out',
      clearProps: 'all',
    }, 0.05);

    tl.from('.activity-card', {
      y: 20,
      autoAlpha: 0,
      duration: 0.5,
      clearProps: 'all',
    }, 0.12);

    tl.from('.bar-pillar-fill', {
      scaleY: 0,
      transformOrigin: 'bottom center',
      duration: 0.6,
      stagger: 0.04,
      ease: 'back.out(1.2)',
      clearProps: 'transform',
    }, 0.22);

    tl.from('.pendientes-card', {
      y: 20,
      autoAlpha: 0,
      duration: 0.5,
      clearProps: 'all',
    }, 0.14);

    tl.from('.pending-item-card', {
      x: 18,
      autoAlpha: 0,
      duration: 0.45,
      stagger: 0.06,
      ease: 'power2.out',
      clearProps: 'all',
    }, 0.22);

    tl.from('.pipeline-card', {
      y: 20,
      autoAlpha: 0,
      duration: 0.5,
      clearProps: 'all',
    }, 0.18);

    tl.from('.pipeline-card .glass-pill-row', {
      y: 14,
      autoAlpha: 0,
      duration: 0.45,
      stagger: 0.07,
      ease: 'power2.out',
      clearProps: 'all',
    }, 0.28);

    tl.from('.stage-mini-fill', {
      width: 0,
      duration: 0.65,
      stagger: 0.06,
      ease: 'power2.out',
      clearProps: 'width',
    }, 0.4);

    tl.from('.bot-card', {
      y: 20,
      autoAlpha: 0,
      duration: 0.5,
      clearProps: 'all',
    }, 0.22);

    tl.from('.metric-pill-item', {
      scale: 0.9,
      autoAlpha: 0,
      duration: 0.4,
      stagger: 0.06,
      ease: 'back.out(1.3)',
      clearProps: 'all',
    }, 0.35);
  }

  animatePeriodChange() {
    this.ctx?.add(() => {
      gsap.fromTo('.kpi-value',
        { scale: 0.88, opacity: 0.4 },
        { scale: 1, opacity: 1, duration: 0.35, stagger: 0.04, ease: 'power2.out', clearProps: 'all' }
      );

      gsap.fromTo('.bar-pillar-fill',
        { scaleY: 0 },
        { scaleY: 1, transformOrigin: 'bottom center', duration: 0.5, stagger: 0.035, ease: 'back.out(1.15)', clearProps: 'transform' }
      );

      gsap.fromTo('.stage-counter-number',
        { scale: 0.8, opacity: 0.5 },
        { scale: 1, opacity: 1, duration: 0.35, stagger: 0.04, ease: 'power2.out', clearProps: 'all' }
      );
    });
  }

  ngOnInit() {
    this.load();
    this.sub = this.realtime.events$.pipe(debounceTime(1500)).subscribe(() => this.load(false));
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
    this.ctx?.revert();
  }

  load(spinner = true) {
    if (spinner) this.loading.set(true);
    forkJoin({
      dash: this.api.getDashboard(this.period()).pipe(catchError(() => of(null))),
      rep: this.api.getReportsSummary(this.period()).pipe(catchError(() => of(null))),
    }).subscribe({
      next: ({ dash, rep }) => {
        if (dash) {
          this.stats.set({
            ...MOCK_STATS,
            ...dash,
            aiMessages: dash.aiMessages || 240,
            newLeads: dash.newLeads || 130,
            appointmentsPeriod: rep?.appointmentsCount ?? dash?.appointmentsWeek ?? 13,
            automationRate: dash.automationRate || 25,
            responseRate: dash.responseRate || 45,
          });
        }
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }

  setPeriod(p: '7' | '30' | '90') {
    this.period.set(p);
    this.load();
    this.animatePeriodChange();
  }
}
