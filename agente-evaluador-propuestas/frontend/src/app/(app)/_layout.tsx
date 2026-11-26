import { Redirect, Slot } from 'expo-router';

import { useSession } from '@/core/session/SessionProvider';
import { AppShell } from '@/design/AppShell';

/** Guard de rutas: sin sesión → login. La autoridad real de permisos sigue siendo el backend. */
export default function AuthenticatedLayout() {
  const { ready, token } = useSession();
  if (!ready) return null;
  if (!token) return <Redirect href="/login" />;
  return (
    <AppShell>
      <Slot />
    </AppShell>
  );
}
