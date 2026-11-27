/** Goes to the previous screen; after a reload or a direct link, where there is none, to `fallback`. */
import { type Href, useRouter } from 'expo-router';

import { Boton } from './componentes';

export function BackButton({ fallback }: { fallback: Href }) {
  const router = useRouter();
  return <Boton etiqueta="Atrás" icono="arrow-left" variante="secundario" onPress={() => { if (router.canGoBack()) router.back(); else router.replace(fallback); }} />;
}
