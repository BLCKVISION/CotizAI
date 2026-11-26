import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const KEY = 'session_token';
let inMemory: string | null = null;

/**
 * Móvil: Keychain/Keystore (expo-secure-store).
 * Web: SOLO memoria. Nunca localStorage: cualquier XSS podría leerlo.
 */
export const tokenStorage = {
  async read(): Promise<string | null> {
    if (Platform.OS === 'web') return inMemory;
    return SecureStore.getItemAsync(KEY);
  },
  async save(token: string): Promise<void> {
    inMemory = token;
    if (Platform.OS !== 'web') await SecureStore.setItemAsync(KEY, token);
  },
  async clear(): Promise<void> {
    inMemory = null;
    if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(KEY);
  },
};
