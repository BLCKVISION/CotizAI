import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const CLAVE = 'sesion_token';
let enMemoria: string | null = null;

/** The tab's own storage, or null where it is blocked or missing. */
function tabStorage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Móvil: Keychain/Keystore (expo-secure-store).
 * Web: sessionStorage, para que recargar no cierre la sesión. Se borra al cerrar la pestaña y no se comparte con
 * otras. Nunca localStorage, que la dejaría guardada en el equipo. Un XSS podría leerlo: por eso la CSP estricta, y el
 * servidor además caduca la sesión por inactividad.
 */
export const almacenDeToken = {
  async leer(): Promise<string | null> {
    if (Platform.OS !== 'web') return SecureStore.getItemAsync(CLAVE);
    try {
      return tabStorage()?.getItem(CLAVE) ?? enMemoria;
    } catch {
      return enMemoria;
    }
  },
  async guardar(token: string): Promise<void> {
    enMemoria = token;
    if (Platform.OS !== 'web') return SecureStore.setItemAsync(CLAVE, token);
    try {
      tabStorage()?.setItem(CLAVE, token);
    } catch {
      /* storage full or blocked: the session lasts until the page is reloaded */
    }
  },
  async borrar(): Promise<void> {
    enMemoria = null;
    if (Platform.OS !== 'web') return SecureStore.deleteItemAsync(CLAVE);
    try {
      tabStorage()?.removeItem(CLAVE);
    } catch {
      /* nothing was stored */
    }
  },
};
