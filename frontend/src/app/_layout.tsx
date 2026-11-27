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
import { isSplashDue } from '@/design/splashStore';

function Raiz({ showSplash }: { showSplash: boolean }) {
  const { listo } = useSesion();
  return (
    <Fondo>
      <StatusBar style="dark" />
      <Slot />
      {showSplash ? <SplashGate ready={listo} /> : null}
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
  // Decided once per load, so signing in never brings the loading screen back.
  const [showSplash] = useState(isSplashDue);
  if (!listas && !errorDeFuentes) return showSplash ? <Splash /> : null; // si fallan las fuentes se usa la del sistema en vez de dejar la pantalla en blanco
  return (
    <SesionProvider>
      <Raiz showSplash={showSplash} />
    </SesionProvider>
  );
}
