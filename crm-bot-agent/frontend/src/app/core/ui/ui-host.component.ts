import { Component, inject } from '@angular/core';
import { UiService } from './ui.service';

@Component({
  selector: 'app-ui-host',
  standalone: true,
  template: `
    <div class="toast-stack" aria-live="polite">
      @for (t of ui.toasts(); track t.id) {
        <div class="toast" [class]="'toast ' + t.kind" (click)="ui.dismiss(t.id)">
          <span class="material-symbols-rounded">{{ t.kind === 'success' ? 'check_circle' : t.kind === 'error' ? 'error' : 'info' }}</span>
          <span>{{ t.text }}</span>
        </div>
      }
    </div>
    @if (ui.confirmState(); as c) {
      <div class="modal-overlay confirm-overlay" (click)="c.resolve(false)">
        <div class="card confirm-box" role="alertdialog" aria-modal="true" (click)="$event.stopPropagation()">
          <h3>{{ c.title }}</h3>
          <p>{{ c.message }}</p>
          <div class="confirm-actions">
            <button class="btn btn-ghost" (click)="c.resolve(false)">Cancelar</button>
            <button class="btn" [class]="c.danger ? 'btn btn-danger' : 'btn btn-primary'" (click)="c.resolve(true)">{{ c.confirmLabel }}</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    .toast-stack { position: fixed; right: 20px; bottom: 20px; z-index: 3000; display: flex; flex-direction: column; gap: 10px; max-width: 380px; }
    .toast { display: flex; align-items: flex-start; gap: 10px; padding: 12px 16px; border-radius: 10px; font-size: 13px; font-weight: 500; cursor: pointer;
      background: #161920; border: 1px solid var(--border-highlight); color: var(--text-primary); box-shadow: var(--glass-shadow); }
    .toast .material-symbols-rounded { font-size: 18px; }
    .toast.success .material-symbols-rounded { color: #34d399; } .toast.error { border-color: rgba(239,68,68,.45); } .toast.error .material-symbols-rounded { color: #f87171; } .toast.info .material-symbols-rounded { color: #60a5fa; }
    .confirm-overlay { z-index: 2500; }
    .confirm-box { width: 100%; max-width: 420px; background: #161920; border: 1px solid rgba(255,255,255,.1); padding: 24px; }
    .confirm-box h3 { font-size: 17px; margin-bottom: 8px; } .confirm-box p { color: var(--text-secondary); font-size: 14px; line-height: 1.5; }
    .confirm-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 22px; }
  `,
})
export class UiHostComponent {
  ui = inject(UiService);
}
