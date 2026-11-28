/** Follows the decision trace of one run live (admin only), reconnecting and resuming where it left off. */
import { useEffect, useState } from 'react';

import { ErrorApi } from '@/core/api/cliente';
import { API_URL } from '@/core/config';
import { useSesion } from '@/core/sesion/SesionProvider';
import { mensajeDeError } from '@/core/useDatos';

import { getTraceApi, runPath } from './api';
import { addEvent, MAX_RECONNECTS, parseSse, reconnectDelayMs, type StreamState, toTraceEvent, type TraceEvent } from './trace';

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => (clearTimeout(timer), resolve()), { once: true });
  });

/** State starts fresh because the caller mounts it with `key={runId}`: a new run is a new component. */
export function useTraceStream(projectId: string, runId: string | null, enabled: boolean) {
  const { token, conSesion } = useSesion();
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [state, setState] = useState<StreamState>('connecting');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !runId || !token) return;
    const control = new AbortController();
    const { signal } = control;
    let last = 0;
    let attempt = 0;

    const accept = (raw: unknown) => {
      const event = toTraceEvent(raw);
      if (!event) return;
      last = Math.max(last, event.seq);
      setEvents((current) => addEvent(current, event));
    };

    /** Fallback: the saved trace, fetched repeatedly. Returns true when the run is over. */
    const pollOnce = async (): Promise<boolean> => {
      setState('live');
      for (;;) {
        const history = await conSesion(getTraceApi(projectId, runId));
        history.events.forEach(accept);
        if (history.status !== 'running') return true;
        await sleep(1500, signal);
        if (signal.aborted) return false;
      }
    };

    /** Reads one connection until it ends. Returns true when the server said the run is over. */
    const streamOnce = async (): Promise<boolean> => {
      // The token travels in a header, never in the URL (URLs end up in logs).
      const response = await fetch(`${API_URL}/api/v1${runPath(projectId, runId)}/stream`, {
        signal,
        headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream', ...(last > 0 ? { 'Last-Event-ID': String(last) } : {}) },
      });
      if (!response.ok) {
        const forbidden = response.status === 403;
        throw new ErrorApi(response.status, 'stream', forbidden ? 'Solo el rol administrador puede ver el detalle de la decisión.' : 'No se pudo abrir el seguimiento en vivo.');
      }
      const reader = response.body?.getReader();
      if (!reader) return pollOnce(); // native clients without streaming fetch
      setState('live');
      attempt = 0;
      const decoder = new TextDecoder();
      let rest = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return false;
        const parsed = parseSse(rest + decoder.decode(value, { stream: true }));
        rest = parsed.rest;
        for (const message of parsed.messages) {
          if (message.event === 'end') return true;
          if (message.event !== 'trace') continue;
          try {
            accept(JSON.parse(message.data));
          } catch {
            /* a malformed message is skipped */
          }
        }
      }
    };

    void (async () => {
      while (!signal.aborted) {
        try {
          if (await streamOnce()) {
            setState('ended');
            return;
          }
        } catch (e) {
          if (signal.aborted) return;
          // 401/403/404 will not get better by retrying.
          if (e instanceof ErrorApi && [401, 403, 404].includes(e.estado)) {
            setError(e.message);
            setState('failed');
            return;
          }
          setError(mensajeDeError(e));
        }
        attempt += 1;
        if (attempt > MAX_RECONNECTS) {
          setState('failed');
          return;
        }
        setState('reconnecting');
        await sleep(reconnectDelayMs(attempt), signal);
      }
    })();

    return () => control.abort();
  }, [enabled, runId, projectId, token, conSesion]);

  return { events, state, error };
}
