import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // Inicializar sesión demo para visualización inmediata si no hay token
  if (!auth.isAuthenticated()) {
    if (typeof window !== 'undefined' && !localStorage.getItem('relay_token')) {
      const demoUser = {
        id: 'demo-1',
        name: 'Emanuel',
        email: 'emanuel@relay.com',
        role: 'admin',
        tourStatus: 'completed' as const,
      };
      const demoTenant = {
        id: 'tenant-1',
        name: 'Relay',
        slug: 'relay',
        plan: 'pro',
        status: 'active',
      };
      localStorage.setItem('relay_token', 'demo_relay_token_active');
      localStorage.setItem('relay_user', JSON.stringify(demoUser));
      localStorage.setItem('relay_tenant', JSON.stringify(demoTenant));
      auth.currentUser.set(demoUser);
      auth.currentTenant.set(demoTenant);
      return true;
    }
  }

  if (auth.isAuthenticated()) return true;

  router.navigate(['/auth/login']);
  return false;
};
