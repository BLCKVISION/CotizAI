import { Injectable, signal, effect } from '@angular/core';

export type AppTheme = 'light' | 'dark';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly storageKey = 'relay_theme_mode';

  // Por defecto 'light' según solicitud del usuario
  public currentTheme = signal<AppTheme>(this.getInitialTheme());

  constructor() {
    // Escucha cambios del signal y sincroniza el DOM y localStorage
    effect(() => {
      const theme = this.currentTheme();
      this.applyThemeToDom(theme);
    });
  }

  private getInitialTheme(): AppTheme {
    if (typeof window === 'undefined') return 'light';
    try {
      const stored = localStorage.getItem(this.storageKey) as AppTheme;
      if (stored === 'dark' || stored === 'light') {
        return stored;
      }
    } catch (_) {}
    return 'light'; // Default a tema claro estilo Superpower
  }

  private applyThemeToDom(theme: AppTheme) {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const body = document.body;

    if (theme === 'light') {
      root.classList.add('theme-light');
      root.classList.remove('theme-dark');
      body.classList.add('theme-light');
      body.classList.remove('theme-dark');
    } else {
      root.classList.add('theme-dark');
      root.classList.remove('theme-light');
      body.classList.add('theme-dark');
      body.classList.remove('theme-light');
    }

    try {
      localStorage.setItem(this.storageKey, theme);
    } catch (_) {}
  }

  public toggleTheme() {
    this.currentTheme.update(t => t === 'light' ? 'dark' : 'light');
  }

  public setTheme(theme: AppTheme) {
    this.currentTheme.set(theme);
  }
}



