import { type Href, Redirect } from 'expo-router';

import { useSesion } from '@/core/sesion/SesionProvider';
import { LoginScreen } from '@/features/auth/LoginScreen';

export default function Login() {
  const { token } = useSesion();
  if (token) return <Redirect href={'/home' as Href} />;
  return <LoginScreen />;
}
