import { Redirect } from 'expo-router';

import { useSession } from '@/core/session/SessionProvider';

export default function Home() {
  const { ready, token } = useSession();
  if (!ready) return null;
  return <Redirect href={token ? '/proyectos' : '/login'} />;
}
