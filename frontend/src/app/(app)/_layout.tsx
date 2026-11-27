import { Redirect, Slot } from 'expo-router';

import { useSesion } from '@/core/sesion/SesionProvider';
import { ShellDeApp } from '@/design/ShellDeApp';
import { CotiChat } from '@/features/coti/CotiChat';
import { NotificationsBell } from '@/features/notifications/NotificationsBell';
import { Tour } from '@/features/onboarding/Tour';

/** Guard de rutas: sin sesión → login. La autoridad real de permisos sigue siendo el backend. */
export default function LayoutAutenticado() {
  const { listo, token } = useSesion();
  if (!listo) return null;
  if (!token) return <Redirect href="/login" />;
  return (
    <ShellDeApp
      notifications={<NotificationsBell />}
      overlays={
        <>
          <Tour />
          <CotiChat />
        </>
      }
    >
      <Slot />
    </ShellDeApp>
  );
}
