/** EXPO_PUBLIC_* termina dentro del bundle: aquí solo va configuración pública. */
// Sin barras finales: con API_URL='/' (mismo origen) evita construir '//api/v1/...', que el navegador toma como host 'api'.
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000').replace(/\/+$/, '');
export const TIEMPO_MAXIMO_MS = 15_000;
