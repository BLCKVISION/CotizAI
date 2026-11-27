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
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { SesionProvider, useSesion } from '@/core/sesion/SesionProvider';
import { Fondo } from '@/design/efectos';
import { SplashGate } from '@/design/Splash';
import { isSplashDue } from '@/design/splashStore';
import { ToastHost } from '@/design/ToastHost';

function Raiz({ onReady }: { onReady: () => void }) {
  const { listo } = useSesion();
  useEffect(() => {
    if (listo) onReady();
  }, [listo, onReady]);
  return (
    <Fondo>
      <StatusBar style="dark" />
      <Slot />
      <ToastHost />
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
  const [sessionReady, setSessionReady] = useState(false);
  const onReady = useCallback(() => setSessionReady(true), []);
  const fontsReady = listas || Boolean(errorDeFuentes); // if fonts fail, the system font is used
  return (
    <View style={{ flex: 1 }}>
      {fontsReady ? (
        <SesionProvider>
          <Raiz onReady={onReady} />
        </SesionProvider>
      ) : null}
      {/* A sibling that is mounted from the start: it never restarts its animation while things load. */}
      {showSplash ? <SplashGate ready={fontsReady && sessionReady} /> : null}
    </View>
  );
}
