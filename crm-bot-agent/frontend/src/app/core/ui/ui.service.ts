import { Injectable, signal } from '@angular/core';

export interface Toast { id: number; kind: 'success' | 'error' | 'info'; text: string }
export interface ConfirmState { title: string; message: string; confirmLabel: string; danger: boolean; resolve: (ok: boolean) => void }

/** Avisos (toasts) y diálogos de confirmación con el estilo de Relay; sustituyen a alert()/confirm(). */
@Injectable({ providedIn: 'root' })
export class UiService {
  toasts = signal<Toast[]>([]);
  confirmState = signal<ConfirmState | null>(null);
  private seq = 0;

  toast(text: string, kind: Toast['kind'] = 'success', ms = 3500) {
    const id = ++this.seq;
    this.toasts.update((l) => [...l, { id, kind, text }]);
    setTimeout(() => this.dismiss(id), ms);
  }
  success = (t: string) => this.toast(t, 'success');
  error = (t: string) => this.toast(t, 'error', 6000);
  dismiss(id: number) { this.toasts.update((l) => l.filter((x) => x.id !== id)); }

  confirm(message: string, opts: { title?: string; confirmLabel?: string; danger?: boolean } = {}): Promise<boolean> {
    return new Promise((resolve) =>
      this.confirmState.set({
        title: opts.title ?? 'Confirmar acción',
        message,
        confirmLabel: opts.confirmLabel ?? 'Confirmar',
        danger: opts.danger ?? true,
        resolve: (ok) => { this.confirmState.set(null); resolve(ok); },
      }),
    );
  }
}
