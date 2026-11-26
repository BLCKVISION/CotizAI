import { API_URL, MAX_TIMEOUT_MS } from '../config';

/** Error de la API con el trackId para que soporte pueda rastrearlo en los logs del servidor. */
export class ErrorApi extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly trackId?: string,
  ) {
    super(message);
    this.name = 'ErrorApi';
  }
}

const newTrackId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

type Options = { method?: 'GET' | 'POST' | 'DELETE'; body?: unknown; token?: string | null };

export async function request<T>(route: string, { method = 'GET', body, token }: Options = {}): Promise<T> {
  const trackId = newTrackId();
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), MAX_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_URL}/api/v1${route}`, {
      method: method,
      signal: control.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Track-Id': trackId,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const serverId = response.headers.get('X-Track-Id') ?? trackId;
    if (response.status === 204) return undefined as T;
    const data: unknown = await response.json().catch(() => undefined);
    if (response.ok && data === undefined) {
      // 2xx que no es JSON (p. ej. el index.html de un proxy): no se entrega `{}` como si fuera T.
      throw new ErrorApi(response.status, 'invalid_response', 'El servidor devolvió una respuesta inesperada.', serverId);
    }
    if (!response.ok) {
      const e = (data ?? {}) as { code?: string; message?: string };
      throw new ErrorApi(response.status, e.code ?? 'error', e.message ?? 'Ocurrió un error.', serverId);
    }
    return data as T;
  } catch (e) {
    if (e instanceof ErrorApi) throw e;
    throw new ErrorApi(0, 'no_connection', 'No se pudo conectar con el servidor. Revise su conexión.', trackId);
  } finally {
    clearTimeout(timer);
  }
}
