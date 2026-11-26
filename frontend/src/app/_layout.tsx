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

import { SesionProvider } from '@/core/sesion/SesionProvider';
import { Fondo } from '@/design/efectos';

function Raiz() {
  return (
    <Fondo>
      <StatusBar style="dark" />
      <Slot />
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
  if (!listas && !errorDeFuentes) return null; // si fallan las fuentes se usa la del sistema en vez de dejar la pantalla en blanco
  return (
    <SesionProvider>
      <Raiz />
    </SesionProvider>
  );
}
