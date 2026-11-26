import { type Href, Redirect } from 'expo-router';

import { useSesion } from '@/core/sesion/SesionProvider';

export default function Inicio() {
  const { listo, token } = useSesion();
  if (!listo) return null;
  return <Redirect href={token ? ('/home' as Href) : '/login'} />;
}
