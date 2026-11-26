import { Component, OnInit, AfterViewInit, OnDestroy, ElementRef, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { gsap } from 'gsap';
import { ApiService } from '../../core/services/api.service';
import { UiService } from '../../core/ui/ui.service';
import { errMsg } from '../../core/ui/errors';

interface WaForm { id?: string; name: string; category: string; language: string; status: string; body: string }
const blank = (): WaForm => ({ name: '', category: 'UTILITY', language: 'es', status: 'APPROVED', body: '' });

@Component({
  selector: 'app-plantillas',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './plantillas.component.html',
  styleUrls: ['./plantillas.component.scss'],
})
export class PlantillasComponent implements OnInit, AfterViewInit, OnDestroy {
  private el = inject(ElementRef);
  private ctx?: gsap.Context;
  private api = inject(ApiService);
  private ui = inject(UiService);

  viewMode = signal<'system' | 'whatsapp'>('system');
  selectedTemplate = signal<any | null>(null);
  copied = signal(false);
  applying = signal(false);

  systemTemplates = signal<any[]>([]);
  waTemplates = signal<any[]>([]);
  loadingSystem = signal(true);
  loadingWa = signal(true);

  showModal = signal(false);
  saving = signal(false);
  formError = signal('');
  form: WaForm = blank();

  ngOnInit() {
    this.api.getAiTemplates().subscribe({
      next: (list) => {
        this.systemTemplates.set(list);
        this.selectedTemplate.set(list[0] ?? null);
        this.loadingSystem.set(false);
        setTimeout(() => this.animateTemplateCards(), 50);
      },
      error: () => this.loadingSystem.set(false),
    });
    this.loadWaTemplates();
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

    tl.from('.view-toggle', {
      y: 14,
      autoAlpha: 0,
      duration: 0.4,
      clearProps: 'all',
    }, 0.08);

    tl.from('.templates-sidebar .template-item', {
      x: -16,
      autoAlpha: 0,
      duration: 0.45,
      stagger: 0.05,
      ease: 'power2.out',
      clearProps: 'all',
    }, 0.12);

    tl.from('.template-detail', {
      y: 20,
      autoAlpha: 0,
      duration: 0.5,
      clearProps: 'all',
    }, 0.18);
  }

  animateTemplateCards() {
    this.ctx?.add(() => {
      gsap.from('.templates-sidebar .template-item', {
        x: -14,
        autoAlpha: 0,
        duration: 0.35,
        stagger: 0.04,
        ease: 'power2.out',
        clearProps: 'all',
      });
    });
  }

  animateWaCards() {
    this.ctx?.add(() => {
      gsap.from('.wa-card', {
        y: 16,
        autoAlpha: 0,
        duration: 0.4,
        stagger: 0.05,
        ease: 'power2.out',
        clearProps: 'all',
      });
    });
  }

  setViewMode(mode: 'system' | 'whatsapp') {
    this.viewMode.set(mode);
    setTimeout(() => {
      if (mode === 'system') {
        this.animateTemplateCards();
      } else {
        this.animateWaCards();
      }
    }, 50);
  }

  ngOnDestroy() {
    this.ctx?.revert();
  }

  loadWaTemplates() {
    this.api.getTemplates().subscribe({
      next: (data) => {
        this.waTemplates.set(data);
        this.loadingWa.set(false);
      },
      error: (e) => {
        this.loadingWa.set(false);
        this.ui.error(errMsg(e, 'No se pudieron cargar las plantillas'));
      },
    });
  }

  selectSystemTemplate(t: any) {
    this.selectedTemplate.set(t);
    this.ctx?.add(() => {
      gsap.fromTo('.template-detail',
        { autoAlpha: 0.7, y: 8 },
        { autoAlpha: 1, y: 0, duration: 0.28, ease: 'power2.out', clearProps: 'all' }
      );
    });
  }

  copyPrompt() {
    const t = this.selectedTemplate();
    if (!t) return;
    const fullText = `### ROL DEL AGENTE: ${t.agentName} (${t.agentRole})\nPersonalidad: ${t.personality}\n\nSALUDO:\n${t.greeting}\n\nFLUJO DE VENTAS:\n${t.salesFlow}\n\nRESTRICCIONES:\n${t.restrictions}\n\nFAQ:\n${t.faq}`;
    navigator.clipboard?.writeText(fullText).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    }, () => this.ui.error('No se pudo copiar al portapapeles'));
  }

  async applyToAi() {
    const t = this.selectedTemplate();
    if (!t) return;
    if (!(await this.ui.confirm(`Se sobrescribirán el rol, la personalidad, el flujo de ventas, las restricciones y las FAQ de tu agente con la plantilla "${t.title}".`, { title: 'Aplicar plantilla al agente', confirmLabel: 'Aplicar', danger: false }))) return;
    this.applying.set(true);
    this.api.applyAiTemplate(t.id).subscribe({
      next: () => {
        this.applying.set(false);
        this.ui.success(`Plantilla "${t.title}" aplicada al Agente IA`);
      },
      error: (e) => {
        this.applying.set(false);
        this.ui.error(errMsg(e, 'No se pudo aplicar la plantilla'));
      },
    });
  }

  // ── Plantillas de WhatsApp propias ────────────────────────
  bodyOf(wt: any): string {
    return wt.body || wt.components?.find((c: any) => c.type === 'BODY')?.text || '';
  }
  statusChip(s: string) {
    return { APPROVED: 'chip-green', PENDING: 'chip-amber', REJECTED: 'chip-red', DISABLED: 'chip-gray' }[s] ?? 'chip-blue';
  }
  statusLabel(s: string) {
    return { APPROVED: 'Aprobada', PENDING: 'Pendiente', REJECTED: 'Rechazada', DISABLED: 'Desactivada' }[s] ?? s;
  }

  openCreate() {
    this.form = blank();
    this.formError.set('');
    this.showModal.set(true);
  }
  openEdit(wt: any) {
    this.form = {
      id: wt.id,
      name: wt.name,
      category: wt.category ?? 'UTILITY',
      language: wt.language ?? 'es',
      status: wt.status ?? 'APPROVED',
      body: this.bodyOf(wt)
    };
    this.formError.set('');
    this.showModal.set(true);
  }

  save() {
    const f = this.form;
    if (!/^[a-z0-9_]{1,120}$/.test(f.name.trim())) {
      this.formError.set('El nombre solo admite minúsculas, números y guion bajo (ej. recordatorio_cita).');
      return;
    }
    if (!f.body.trim()) {
      this.formError.set('Escribe el texto del mensaje.');
      return;
    }
    if (f.body.length > 1024) {
      this.formError.set('El texto no puede superar 1024 caracteres.');
      return;
    }
    const body = {
      name: f.name.trim(),
      category: f.category,
      language: f.language,
      status: f.status,
      body: f.body.trim()
    };
    this.saving.set(true);
    this.formError.set('');
    (f.id ? this.api.updateTemplate(f.id, body) : this.api.createTemplate(body)).subscribe({
      next: () => {
        this.saving.set(false);
        this.showModal.set(false);
        this.ui.success(f.id ? 'Plantilla actualizada' : 'Plantilla creada');
        this.loadWaTemplates();
      },
      error: (e) => {
        this.saving.set(false);
        this.formError.set(errMsg(e, 'No se pudo guardar la plantilla'));
      },
    });
  }

  async remove(wt: any) {
    if (!(await this.ui.confirm(`Se eliminará la plantilla "${wt.name}". Las reglas del funnel que la usen dejarán de enviar ese texto.`, { title: 'Eliminar plantilla', confirmLabel: 'Eliminar' }))) return;
    this.api.deleteTemplate(wt.id).subscribe({
      next: () => {
        this.ui.success('Plantilla eliminada');
        this.loadWaTemplates();
      },
      error: (e) => this.ui.error(errMsg(e))
    });
  }
}
