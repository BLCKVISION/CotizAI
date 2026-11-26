import { HttpErrorResponse } from '@angular/common/http';

/** Mensaje legible de un error HTTP del backend (message puede ser string o lista). */
export function errMsg(e: unknown, fallback = 'Ocurrió un error. Inténtalo de nuevo.'): string {
  if (e instanceof HttpErrorResponse) {
    if (e.status === 0) return 'No hay conexión con el servidor.';
    if (e.status === 429) return 'Demasiados intentos. Espera un momento e inténtalo de nuevo.';
    const m = (e.error as { message?: string | string[] } | null)?.message;
    if (Array.isArray(m)) return m.join('. ');
    if (typeof m === 'string' && m) return m;
  }
  return fallback;
}
