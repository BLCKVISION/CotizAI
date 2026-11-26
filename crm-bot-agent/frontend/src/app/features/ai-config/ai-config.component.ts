import { Component, OnInit, AfterViewInit, OnDestroy, ElementRef, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { gsap } from 'gsap';
import { ApiService } from '../../core/services/api.service';
import { UiService } from '../../core/ui/ui.service';
import { errMsg } from '../../core/ui/errors';

export type Tab = 'general' | 'prompt' | 'restrictions' | 'faq' | 'handoff' | 'test' | 'presets';

interface ChatLine { who: 'me' | 'ai' | 'err'; text: string }

@Component({
  selector: 'app-ai-config',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ai-config.component.html',
  styleUrls: ['./ai-config.component.scss'],
})
export class AiConfigComponent implements OnInit, AfterViewInit, OnDestroy {
    private el = inject(ElementRef);
  private ctx?: gsap.Context;
  private api = inject(ApiService);
  private ui = inject(UiService);

  activeTab = signal<Tab>('general');
  loaded = signal(false);
  loadError = signal(false);
  saving = signal(false);
  presets = signal<any[]>([]);
  dirty = signal(false);

  config: any = {
    agentName: '', agentRole: '', businessName: '', businessType: '', language: 'es', tone: '', personality: '', greeting: '',
    systemPrompt: '', salesFlow: '', restrictions: '', faq: '', isAiActive: true,
    handoffMessage: '', outOfHoursMessage: '', hours: { enabled: false, days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' },
  };
  /** Palabras de derivación como texto separado por comas. */
  keywordsText = '';

  readonly dayNames = [
    { v: 1, l: 'Lun' }, { v: 2, l: 'Mar' }, { v: 3, l: 'Mié' },
    { v: 4, l: 'Jue' }, { v: 5, l: 'Vie' }, { v: 6, l: 'Sáb' }, { v: 0, l: 'Dom' }
  ];

  // Probar agente
  testInput = '';
  testing = signal(false);
  chat = signal<ChatLine[]>([]);

  ngOnInit() {
    this.loadConfig();
    this.api.getAiTemplates().subscribe({ next: (p) => this.presets.set(p), error: () => {} });
  }

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

    tl.from('.tabs-nav .tab-btn', {
      y: 14,
      autoAlpha: 0,
      duration: 0.4,
      stagger: 0.04,
      clearProps: 'all',
    }, 0.08);

    tl.from('.tab-content', {
      y: 20,
      autoAlpha: 0,
      duration: 0.5,
      clearProps: 'all',
    }, 0.16);

    tl.from('.tab-content .form-group', {
      y: 14,
      autoAlpha: 0,
      duration: 0.38,
      stagger: 0.04,
      ease: 'power2.out',
      clearProps: 'all',
    }, 0.24);
  }

  setTab(t: Tab) {
    this.activeTab.set(t);
    this.ctx?.add(() => {
      gsap.fromTo('.tab-content',
        { autoAlpha: 0.7, y: 10 },
        { autoAlpha: 1, y: 0, duration: 0.3, ease: 'power2.out', clearProps: 'all' }
      );
      setTimeout(() => {
        gsap.from('.tab-content .form-group, .tab-content .preset-card', {
          y: 10,
          autoAlpha: 0,
          duration: 0.3,
          stagger: 0.035,
          ease: 'power2.out',
          clearProps: 'all',
        });
      }, 30);
    });
  }

  ngOnDestroy() {
    this.ctx?.revert();
  }

  loadConfig() {
    this.api.getAiConfig().subscribe({
      next: (data) => {
        this.applyLoaded(data);
        this.loaded.set(true);
        this.loadError.set(false);
      },
      error: () => {
        // Offline / local fallback to allow UI exploration and team/agent administration
        this.loaded.set(true);
        this.loadError.set(false);
      },
    });
  }

  private applyLoaded(data: any) {
    const hours = { enabled: false, days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00', ...(data?.hours ?? {}) };
    this.config = { ...this.config, ...data, hours };
    this.keywordsText = (data?.handoffKeywords ?? []).join(', ');
    this.dirty.set(false);
  }

  touch() { this.dirty.set(true); }

  toggleDay(d: number) {
    const days: number[] = this.config.hours.days;
    this.config.hours.days = days.includes(d) ? days.filter((x) => x !== d) : [...days, d];
    this.touch();
  }

  saveConfig() {
    const c = this.config;
    if (c.hours.enabled) {
      if (!c.hours.days.length) { this.ui.error('Elige al menos un día de atención.'); return; }
      if (!/^\d{2}:\d{2}$/.test(c.hours.start) || !/^\d{2}:\d{2}$/.test(c.hours.end) || c.hours.start >= c.hours.end) {
        this.ui.error('El horario de atención no es válido (la hora de inicio debe ser anterior a la de cierre).');
        return;
      }
      if (!c.outOfHoursMessage?.trim()) { this.ui.error('Escribe el mensaje que se enviará fuera de horario.'); return; }
    }
    const body = {
      agentName: c.agentName, agentRole: c.agentRole, businessName: c.businessName, businessType: c.businessType, language: c.language,
      tone: c.tone, personality: c.personality, greeting: c.greeting, systemPrompt: c.systemPrompt, salesFlow: c.salesFlow,
      restrictions: c.restrictions, faq: c.faq, isAiActive: c.isAiActive, handoffMessage: c.handoffMessage, outOfHoursMessage: c.outOfHoursMessage,
      hours: c.hours, handoffKeywords: this.keywordsText.split(',').map((k) => k.trim()).filter(Boolean).slice(0, 30),
    };
    this.saving.set(true);
    this.api.saveAiConfig(body).subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.applyLoaded(saved ?? {});
        this.ui.success('Configuración guardada');
      },
      error: (e) => {
        this.saving.set(false);
        this.ui.error(errMsg(e, 'No se pudo guardar la configuración'));
      },
    });
  }

  async applyPreset(p: any) {
    const ok = await this.ui.confirm(
      `Se actualizarán el rol, la personalidad, el flujo de ventas, las restricciones y las FAQ con la plantilla "${p.title}". Tus cambios sin guardar se perderán.`,
      { title: 'Aplicar plantilla', confirmLabel: 'Aplicar', danger: false }
    );
    if (!ok) return;
    this.saving.set(true);
    this.api.applyAiTemplate(p.id).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.applyLoaded(updated);
        this.setTab('general');
        this.ui.success(`Plantilla "${p.title}" cargada`);
      },
      error: (e) => {
        this.saving.set(false);
        this.ui.error(errMsg(e, 'No se pudo aplicar la plantilla'));
      },
    });
  }

  sendTest() {
    const text = this.testInput.trim();
    if (!text || this.testing()) return;
    this.chat.update((l) => [...l, { who: 'me', text }]);
    this.testInput = '';
    this.testing.set(true);
    this.api.testAgent(text).subscribe({
      next: (r) => {
        this.testing.set(false);
        this.chat.update((l) => [...l, { who: 'ai', text: r?.response || '(sin respuesta)' }]);
      },
      error: (e) => {
        this.testing.set(false);
        this.chat.update((l) => [...l, { who: 'err', text: errMsg(e, 'El agente no pudo responder') }]);
      },
    });
  }
}
