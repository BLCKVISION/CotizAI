import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { UiService } from '../../core/ui/ui.service';
import { errMsg } from '../../core/ui/errors';

interface RuleForm { id?: string; name: string; trigger: string; stage: string; waitHours: number; toStage: string; sendTemplate: string; sendText: string; moveStage: string; isActive: boolean }
interface StepForm { id?: string; name: string; prompt: string; objectives: string; criteria: string }

const blankRule = (): RuleForm => ({ name: '', trigger: 'inactivity_24h', stage: '', waitHours: 24, toStage: '', sendTemplate: '', sendText: '', moveStage: '', isActive: true });
const blankStep = (): StepForm => ({ name: '', prompt: '', objectives: '', criteria: '' });

@Component({
  selector: 'app-funnel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './funnel.component.html',
  styleUrls: ['./funnel.component.scss'],
})
export class FunnelComponent implements OnInit {
  private api = inject(ApiService);
  private ui = inject(UiService);

  tab = signal<'rules' | 'steps'>('rules');

  pipelineStages = [
    { id: 'nuevo', label: 'Nuevo Lead' },
    { id: 'contactado', label: 'Contactado' },
    { id: 'calificado', label: 'Calificado' },
    { id: 'interesado', label: 'Interesado' },
    { id: 'negociacion', label: 'Negociación / Cita' },
    { id: 'cerrado', label: 'Venta Ganada' },
    { id: 'perdido', label: 'Perdido / Descartado' },
  ];

  // ── Automatizaciones ──────────────────────────────────────
  rules = signal<any[]>([]);
  rulesLoading = signal(true);
  templates = signal<{ name: string; body: string }[]>([]);
  showRuleModal = signal(false);
  ruleSaving = signal(false);
  ruleError = signal('');
  rule: RuleForm = blankRule();

  // ── Pasos del agente ──────────────────────────────────────
  steps = signal<any[]>([]);
  stepsLoading = signal(true);
  stepTemplates = signal<{ key: string; name: string; steps: number }[]>([]);
  showStepModal = signal(false);
  stepSaving = signal(false);
  stepError = signal('');
  step: StepForm = blankStep();
  showTplModal = signal(false);

  ngOnInit() {
    this.loadRules();
    this.loadSteps();
    this.api.getTemplates().subscribe({ next: (t) => this.templates.set(t.map((x) => ({ name: x.name, body: x.body }))), error: () => {} });
    this.api.getFunnelTemplates().subscribe({ next: (t) => this.stepTemplates.set(t), error: () => {} });
  }

  // ════ Reglas ════
  loadRules() {
    this.api.getFunnelRules().subscribe({
      next: (data) => { this.rules.set(data ?? []); this.rulesLoading.set(false); },
      error: (e) => { this.rulesLoading.set(false); this.ui.error(errMsg(e, 'No se pudieron cargar las reglas')); },
    });
  }

  openCreateModal() { this.rule = blankRule(); this.ruleError.set(''); this.showRuleModal.set(true); }
  openEditRule(r: any) {
    this.rule = {
      id: r.id, name: r.name, trigger: r.trigger, stage: r.conditions?.stage ?? '', waitHours: r.conditions?.waitHours ?? 24, toStage: r.conditions?.toStage ?? '',
      sendTemplate: r.actions?.sendTemplate ?? '', sendText: r.actions?.sendText ?? '', moveStage: r.actions?.moveStage ?? '', isActive: r.isActive,
    };
    this.ruleError.set(''); this.showRuleModal.set(true);
  }

  saveRule() {
    const f = this.rule;
    if (f.name.trim().length < 2) { this.ruleError.set('Ponle un nombre a la regla.'); return; }
    if (f.trigger === 'inactivity_24h' && (!(f.waitHours >= 1) || f.waitHours > 720)) { this.ruleError.set('Las horas de espera deben estar entre 1 y 720.'); return; }
    if (!f.sendTemplate && !f.sendText.trim() && !f.moveStage) { this.ruleError.set('Define al menos una acción: enviar un mensaje o mover al cliente de etapa.'); return; }
    const conditions: any = {};
    if (f.trigger === 'inactivity_24h') { conditions.waitHours = Math.round(f.waitHours); if (f.stage) conditions.stage = f.stage; }
    if (f.trigger === 'stage_changed' && f.toStage) conditions.toStage = f.toStage;
    const actions: any = {};
    if (f.sendTemplate) actions.sendTemplate = f.sendTemplate;
    if (f.sendText.trim()) actions.sendText = f.sendText.trim();
    if (f.moveStage) actions.moveStage = f.moveStage;
    const body = { name: f.name.trim(), trigger: f.trigger, conditions, actions, isActive: f.isActive };
    this.ruleSaving.set(true); this.ruleError.set('');
    (f.id ? this.api.updateFunnelRule(f.id, body) : this.api.createFunnelRule(body)).subscribe({
      next: () => { this.ruleSaving.set(false); this.showRuleModal.set(false); this.ui.success(f.id ? 'Regla actualizada' : 'Regla creada'); this.loadRules(); },
      error: (e) => { this.ruleSaving.set(false); this.ruleError.set(errMsg(e, 'No se pudo guardar la regla')); },
    });
  }

  toggleRule(r: any) {
    this.api.toggleFunnelRule(r.id).subscribe({
      next: () => this.rules.update((l) => l.map((x) => (x.id === r.id ? { ...x, isActive: !x.isActive } : x))),
      error: (e) => this.ui.error(errMsg(e)),
    });
  }

  async deleteRule(r: any) {
    if (!(await this.ui.confirm(`Se eliminará la automatización "${r.name}".`, { title: 'Eliminar regla', confirmLabel: 'Eliminar' }))) return;
    this.api.deleteFunnelRule(r.id).subscribe({ next: () => { this.ui.success('Regla eliminada'); this.loadRules(); }, error: (e) => this.ui.error(errMsg(e)) });
  }

  getTriggerLabel(trigger: string) {
    switch (trigger) {
      case 'inactivity_24h': case 'inactivity': return 'Cliente sin responder';
      case 'post_appointment': case 'appointment_created': return 'Cita agendada';
      case 'stage_changed': case 'status_changed': return 'Cambio de etapa';
      default: return trigger;
    }
  }
  triggerDetail(r: any) {
    const c = r.conditions ?? {};
    if (r.trigger === 'inactivity_24h' || r.trigger === 'inactivity') return `${c.waitHours ?? 24} h sin respuesta${c.stage ? ' · etapa ' + this.stageLabel(c.stage) : ''}`;
    if (r.trigger === 'stage_changed' || r.trigger === 'status_changed') return c.toStage ? `pasa a ${this.stageLabel(c.toStage)}` : 'a cualquier etapa';
    return '';
  }
  stageLabel(id: string) { return this.pipelineStages.find((s) => s.id === id)?.label ?? id; }

  // ════ Pasos del agente ════
  loadSteps() {
    this.api.getFunnelSteps().subscribe({
      next: (data) => { this.steps.set([...(data ?? [])].sort((a, b) => a.position - b.position)); this.stepsLoading.set(false); },
      error: (e) => { this.stepsLoading.set(false); this.ui.error(errMsg(e, 'No se pudieron cargar los pasos')); },
    });
  }

  openCreateStep() { this.step = blankStep(); this.stepError.set(''); this.showStepModal.set(true); }
  openEditStep(s: any) { this.step = { id: s.id, name: s.name, prompt: s.prompt ?? '', objectives: s.objectives ?? '', criteria: s.criteria ?? '' }; this.stepError.set(''); this.showStepModal.set(true); }

  saveStep() {
    const f = this.step;
    if (!f.name.trim()) { this.stepError.set('El paso necesita un nombre.'); return; }
    const body: any = { name: f.name.trim(), prompt: f.prompt, objectives: f.objectives, criteria: f.criteria };
    if (!f.id) body.position = this.steps().length;
    this.stepSaving.set(true); this.stepError.set('');
    (f.id ? this.api.updateFunnelStep(f.id, body) : this.api.createFunnelStep(body)).subscribe({
      next: () => { this.stepSaving.set(false); this.showStepModal.set(false); this.ui.success(f.id ? 'Paso actualizado' : 'Paso creado'); this.loadSteps(); },
      error: (e) => { this.stepSaving.set(false); this.stepError.set(errMsg(e, 'No se pudo guardar el paso')); },
    });
  }

  async deleteStep(s: any) {
    if (!(await this.ui.confirm(`Se eliminará el paso "${s.name}" del funnel del agente.`, { title: 'Eliminar paso', confirmLabel: 'Eliminar' }))) return;
    this.api.deleteFunnelStep(s.id).subscribe({ next: () => { this.ui.success('Paso eliminado'); this.loadSteps(); }, error: (e) => this.ui.error(errMsg(e)) });
  }

  swapStep(i: number, dir: -1 | 1) {
    const list = [...this.steps()], j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    this.steps.set(list);
    let pending = 0, failed = false;
    list.forEach((s, pos) => {
      if (s.position === pos) return;
      pending++;
      this.api.updateFunnelStep(s.id, { position: pos }).subscribe({ error: () => { failed = true; }, complete: () => { if (--pending === 0) { if (failed) this.ui.error('No se pudo guardar el orden'); this.loadSteps(); } } });
    });
  }

  async applyTemplate(key: string, name: string) {
    if (this.steps().length && !(await this.ui.confirm(`Se reemplazarán tus ${this.steps().length} pasos actuales por la plantilla "${name}".`, { title: 'Aplicar plantilla', confirmLabel: 'Reemplazar', danger: false }))) return;
    this.api.applyFunnelTemplate(key).subscribe({
      next: () => { this.showTplModal.set(false); this.ui.success(`Plantilla "${name}" aplicada`); this.loadSteps(); },
      error: (e) => this.ui.error(errMsg(e, 'No se pudo aplicar la plantilla')),
    });
  }
}
