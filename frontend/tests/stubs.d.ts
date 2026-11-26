declare module 'react-native' { export const Platform: { OS: string }; }
declare module 'expo-secure-store' {
  export function getItemAsync(k: string): Promise<string | null>;
  export function setItemAsync(k: string, v: string): Promise<void>;
  export function deleteItemAsync(k: string): Promise<void>;
}
