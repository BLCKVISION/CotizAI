/** Short notices that float over any screen. A tiny store, so any module can raise one without a provider. */
export type ToastTone = 'error' | 'success' | 'info';
export type Toast = { id: number; tone: ToastTone; title: string; detail?: string };

const DURATION_MS: Record<ToastTone, number> = { error: 6000, success: 4000, info: 4500 };
const MAX_VISIBLE = 3;

type Listener = (toasts: Toast[]) => void;
let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<Listener>();
const emit = () => { listeners.forEach((l) => { l(toasts); }); };

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function showToast(toast: Omit<Toast, 'id'>) {
  // The same notice raised twice only refreshes the one on screen.
  toasts = toasts.filter((t) => t.title !== toast.title || t.detail !== toast.detail);
  const id = nextId++;
  toasts = [...toasts, { ...toast, id }].slice(-MAX_VISIBLE);
  emit();
  setTimeout(() => { dismissToast(id); }, DURATION_MS[toast.tone]);
}

export function subscribeToasts(listener: Listener) {
  listeners.add(listener);
  listener(toasts);
  return () => {
    listeners.delete(listener);
  };
}
