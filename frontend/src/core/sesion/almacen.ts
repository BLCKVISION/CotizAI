import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const CLAVE = 'sesion_token';
let enMemoria: string | null = null;

/**
 * Móvil: Keychain/Keystore (expo-secure-store).
 * Web: SOLO memoria. Nunca localStorage: cualquier XSS podría leerlo.
 */
export const almacenDeToken = {
  async leer(): Promise<string | null> {
    if (Platform.OS === 'web') return enMemoria;
    return SecureStore.getItemAsync(CLAVE);
  },
  async guardar(token: string): Promise<void> {
    enMemoria = token;
    if (Platform.OS !== 'web') await SecureStore.setItemAsync(CLAVE, token);
  },
  async borrar(): Promise<void> {
    enMemoria = null;
    if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(CLAVE);
  },
};
