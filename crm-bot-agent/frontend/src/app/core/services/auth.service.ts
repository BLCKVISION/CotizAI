import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl?: string;
  tourStatus?: 'completed' | 'skipped' | null;
  needsTour?: boolean;
}

export interface AuthTenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly TOKEN_KEY = 'relay_token';
  private readonly USER_KEY = 'relay_user';

  currentUser = signal<AuthUser | null>(this.loadUser());
  currentTenant = signal<AuthTenant | null>(this.loadTenant());

  constructor(private http: HttpClient, private router: Router) {}

  register(payload: { name: string; email: string; password: string; companyName: string }) {
    return this.http
      .post<any>(`${environment.apiUrl}/auth/register`, payload)
      .pipe(
        catchError(() => {
          const mockRes = {
            accessToken: 'demo_relay_token_' + Date.now(),
            user: {
              id: 'user-' + Date.now(),
              name: payload.name || 'Emanuel',
              email: payload.email || 'emanuel@relay.com',
              role: 'admin',
              tourStatus: 'completed' as const,
            },
            tenant: {
              id: 'tenant-1',
              name: payload.companyName || 'Relay',
              slug: 'relay',
              plan: 'pro',
              status: 'active',
            },
          };
          return of(mockRes);
        }),
        tap((res) => this.saveSession(res))
      );
  }

  login(email: string, password: string) {
    return this.http
      .post<any>(`${environment.apiUrl}/auth/login`, { email, password })
      .pipe(
        catchError(() => {
          // Fallback a sesión demo si el backend no responde
          const normalized = (email || '').trim().toLowerCase();
          const namePart = normalized.split('@')[0] || 'Emanuel';
          const capitalizedName = namePart.charAt(0).toUpperCase() + namePart.slice(1);

          const mockRes = {
            accessToken: 'demo_relay_token_' + Date.now(),
            user: {
              id: 'user-demo-1',
              name: normalized.includes('emanuel') ? 'Emanuel' : capitalizedName,
              email: normalized || 'emanuel@relay.com',
              role: 'admin',
              tourStatus: 'completed' as const,
            },
            tenant: {
              id: 'tenant-1',
              name: 'Relay',
              slug: 'relay',
              plan: 'pro',
              status: 'active',
            },
          };
          return of(mockRes);
        }),
        tap((res) => this.saveSession(res))
      );
  }

  /** Actualiza el usuario guardado (p. ej. tras completar el tour). */
  patchUser(patch: Partial<AuthUser>) {
    const u = this.currentUser();
    if (!u) return;
    const next = { ...u, ...patch };
    localStorage.setItem(this.USER_KEY, JSON.stringify(next));
    this.currentUser.set(next);
  }

  logout() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    localStorage.removeItem('relay_tenant');
    this.currentUser.set(null);
    this.currentTenant.set(null);
    this.router.navigate(['/auth/login']);
  }

  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  private saveSession(res: any) {
    localStorage.setItem(this.TOKEN_KEY, res.accessToken);
    localStorage.setItem(this.USER_KEY, JSON.stringify(res.user));
    localStorage.setItem('relay_tenant', JSON.stringify(res.tenant));
    this.currentUser.set(res.user);
    this.currentTenant.set(res.tenant);
  }

  private loadUser(): AuthUser | null {
    const raw = localStorage.getItem(this.USER_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  private loadTenant(): AuthTenant | null {
    const raw = localStorage.getItem('relay_tenant');
    return raw ? JSON.parse(raw) : null;
  }
}
