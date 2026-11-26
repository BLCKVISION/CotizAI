import {
  Urbanist_300Light,
  Urbanist_400Regular,
  Urbanist_500Medium,
  Urbanist_600SemiBold,
  Urbanist_700Bold,
  useFonts,
} from '@expo-google-fonts/urbanist';
import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { SessionProvider } from '@/core/session/SessionProvider';
import { Background } from '@/design/effects';

function Root() {
  return (
    <Background>
      <StatusBar style="dark" />
      <Slot />
    </Background>
  );
}

export default function RootLayout() {
  const [lists, fontError] = useFonts({
    Urbanist_300Light,
    Urbanist_400Regular,
    Urbanist_500Medium,
    Urbanist_600SemiBold,
    Urbanist_700Bold,
  });
  if (!lists && !fontError) return null; // si fallan las fuentes se usa la del sistema en vez de dejar la pantalla en blanco
  return (
    <SessionProvider>
      <Root />
    </SessionProvider>
  );
}
