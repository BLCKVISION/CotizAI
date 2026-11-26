import { Redirect, Slot } from 'expo-router';

import { useSesion } from '@/core/sesion/SesionProvider';
import { ShellDeApp } from '@/design/ShellDeApp';

/** Guard de rutas: sin sesión → login. La autoridad real de permisos sigue siendo el backend. */
export default function LayoutAutenticado() {
  const { listo, token } = useSesion();
  if (!listo) return null;
  if (!token) return <Redirect href="/login" />;
  return (
    <ShellDeApp>
      <Slot />
    </ShellDeApp>
  );
}
