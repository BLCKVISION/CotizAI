import { API_URL, TIEMPO_MAXIMO_MS } from '../config';

/** Error de la API con el trackId para que soporte pueda rastrearlo en los logs del servidor. */
export class ErrorApi extends Error {
  constructor(
    readonly estado: number,
    readonly codigo: string,
    mensaje: string,
    readonly trackId?: string,
  ) {
    super(mensaje);
    this.name = 'ErrorApi';
  }
}

/** El backend puede responder `codigo/mensaje` o `code/message`: se aceptan ambos para no mostrar un error genérico. */
type CuerpoDeError = { codigo?: string; mensaje?: string; code?: string; message?: string };

const nuevoTrackId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

type Opciones = { metodo?: 'GET' | 'POST' | 'DELETE'; cuerpo?: unknown; token?: string | null; timeoutMs?: number };

export async function peticion<T>(ruta: string, { metodo = 'GET', cuerpo, token, timeoutMs = TIEMPO_MAXIMO_MS }: Opciones = {}): Promise<T> {
  const trackId = nuevoTrackId();
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), timeoutMs);
  try {
    const respuesta = await fetch(`${API_URL}/api/v1${ruta}`, {
      method: metodo,
      signal: control.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Track-Id': trackId,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    const idServidor = respuesta.headers.get('X-Track-Id') ?? trackId;
    if (respuesta.status === 204) return undefined as T;
    const datos: unknown = await respuesta.json().catch(() => undefined);
    if (respuesta.ok && datos === undefined) {
      // 2xx que no es JSON (p. ej. el index.html de un proxy): no se entrega `{}` como si fuera T.
      throw new ErrorApi(respuesta.status, 'respuesta_invalida', 'El servidor devolvió una respuesta inesperada.', idServidor);
    }
    if (!respuesta.ok) {
      const e = (datos ?? {}) as CuerpoDeError;
      throw new ErrorApi(respuesta.status, e.codigo ?? e.code ?? 'error', e.mensaje ?? e.message ?? 'Ocurrió un error.', idServidor);
    }
    return datos as T;
  } catch (e) {
    if (e instanceof ErrorApi) throw e;
    throw new ErrorApi(0, 'sin_conexion', 'No se pudo conectar con el servidor. Revise su conexión.', trackId);
  } finally {
    clearTimeout(temporizador);
  }
}

/** Envío o recepción de archivos en binario (sin JSON en el cuerpo). Plazo amplio para documentos de 10 MB. */
export async function peticionBinaria(ruta: string, token: string, cuerpo?: Blob): Promise<Response> {
  const trackId = nuevoTrackId();
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), 120_000);
  try {
    const r = await fetch(`${API_URL}/api/v1${ruta}`, {
      method: cuerpo ? 'POST' : 'GET',
      signal: control.signal,
      headers: {
        'X-Track-Id': trackId,
        Authorization: `Bearer ${token}`,
        ...(cuerpo ? { 'Content-Type': 'application/octet-stream' } : {}),
      },
      body: cuerpo,
    });
    if (!r.ok) {
      const e = ((await r.json().catch(() => undefined)) ?? {}) as CuerpoDeError;
      throw new ErrorApi(r.status, e.codigo ?? e.code ?? 'error', e.mensaje ?? e.message ?? 'Ocurrió un error.', r.headers.get('X-Track-Id') ?? trackId);
    }
    return r;
  } catch (e) {
    if (e instanceof ErrorApi) throw e;
    throw new ErrorApi(0, 'sin_conexion', 'No se pudo conectar con el servidor. Revise su conexión.', trackId);
  } finally {
    clearTimeout(temporizador);
  }
}
