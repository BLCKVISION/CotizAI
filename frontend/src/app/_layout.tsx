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
import { useState } from 'react';

import { SesionProvider, useSesion } from '@/core/sesion/SesionProvider';
import { Fondo } from '@/design/efectos';
import { Splash, SplashGate } from '@/design/Splash';

function Raiz() {
  const { listo, token } = useSesion();
  // Show the logo while the session is restored and again right after signing in (not when signing out).
  const [entries, setEntries] = useState({ count: 0, signedIn: false });
  if (listo && entries.signedIn !== Boolean(token)) setEntries({ count: entries.count + (token ? 1 : 0), signedIn: Boolean(token) });
  return (
    <Fondo>
      <StatusBar style="dark" />
      <Slot />
      <SplashGate ready={listo} trigger={`entry-${entries.count}`} />
    </Fondo>
  );
}

export default function LayoutRaiz() {
  const [listas, errorDeFuentes] = useFonts({
    Urbanist_300Light,
    Urbanist_400Regular,
    Urbanist_500Medium,
    Urbanist_600SemiBold,
    Urbanist_700Bold,
  });
  if (!listas && !errorDeFuentes) return <Splash />; // si fallan las fuentes se usa la del sistema en vez de dejar la pantalla en blanco
  return (
    <SesionProvider>
      <Raiz />
    </SesionProvider>
  );
}
