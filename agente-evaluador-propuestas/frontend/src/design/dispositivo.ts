import { useWindowDimensions } from 'react-native';

import { puntoDeQuiebre } from './tokens';

export type Dispositivo = 'movil' | 'tableta' | 'escritorio';

export function useDispositivo(): { dispositivo: Dispositivo; ancho: number } {
  const { width } = useWindowDimensions();
  const dispositivo: Dispositivo =
    width >= puntoDeQuiebre.escritorio ? 'escritorio' : width >= puntoDeQuiebre.tableta ? 'tableta' : 'movil';
  return { dispositivo, ancho: width };
}
