import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { ErrorApi } from '@/core/api/client';
import { closeSessionApi, startSessionApi, type User, currentUserApi } from '@/features/auth/api';

import { tokenStorage } from './storage';

type State = { ready: boolean; token: string | null; user: User | null };
type Context = State & {
  startSession: (email: string, password: string) => Promise<void>;
  closeSession: () => Promise<void>;
  /** Ejecuta una llamada autenticada; si el servidor responde 401 cierra la sesión local. */
  withSession: <T>(call: (token: string) => Promise<T>) => Promise<T>;
};

const SessionContext = createContext<Context | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ ready: false, token: null, user: null });

  useEffect(() => {
    (async () => {
      // Si el usuario ya inició sesión mientras se restauraba, no se pisa su estado.
      const apply = (fresh: State) => setState((current) => (current.ready ? current : fresh));
      const token = await tokenStorage.read();
      if (!token) return apply({ ready: true, token: null, user: null });
      try {
        apply({ ready: true, token, user: await currentUserApi(token) });
      } catch (e) {
        // Solo un 401/403 invalida el token; un fallo de red o un 5xx conserva la sesión (sin datos de usuario).
        if (e instanceof ErrorApi && (e.status === 401 || e.status === 403)) {
          await tokenStorage.clear();
          apply({ ready: true, token: null, user: null });
        } else {
          apply({ ready: true, token, user: null });
        }
      }
    })();
  }, []);

  const startSession = useCallback<Context['startSession']>(async (email, password) => {
    const r = await startSessionApi(email.trim().toLowerCase(), password);
    await tokenStorage.save(r.access_token);
    setState({ ready: true, token: r.access_token, user: r.user });
  }, []);

  const closeSession = useCallback(async () => {
    const token = state.token;
    setState({ ready: true, token: null, user: null });
    await tokenStorage.clear();
    if (token) await closeSessionApi(token).catch(() => undefined); // best effort: el token ya no se usa
  }, [state.token]);

  const withSession = useCallback<Context['withSession']>(
    async (call) => {
      if (!state.token) throw new ErrorApi(401, 'invalid_session', 'Sesión inválida o expirada.');
      try {
        return await call(state.token);
      } catch (e) {
        if (e instanceof ErrorApi && e.status === 401) {
          await tokenStorage.clear();
          setState({ ready: true, token: null, user: null });
        }
        throw e;
      }
    },
    [state.token],
  );

  const value = useMemo(() => ({ ...state, startSession, closeSession, withSession }), [state, startSession, closeSession, withSession]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Context {
  const c = useContext(SessionContext);
  if (!c) throw new Error('useSession debe usarse dentro de <SessionProvider>.');
  return c;
}
