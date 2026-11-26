import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { ErrorApi } from '@/core/api/cliente';
import { cerrarSesionApi, iniciarSesionApi, type Usuario, usuarioActualApi } from '@/features/auth/api';

import { almacenDeToken } from './almacen';

type Estado = { listo: boolean; token: string | null; usuario: Usuario | null };
type Contexto = Estado & {
  iniciarSesion: (correo: string, contrasena: string) => Promise<void>;
  cerrarSesion: () => Promise<void>;
  /** Ejecuta una llamada autenticada; si el servidor responde 401 cierra la sesión local. */
  conSesion: <T>(llamada: (token: string) => Promise<T>) => Promise<T>;
};

const SesionContext = createContext<Contexto | null>(null);

export function SesionProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Estado>({ listo: false, token: null, usuario: null });

  useEffect(() => {
    (async () => {
      // Si el usuario ya inició sesión mientras se restauraba, no se pisa su estado.
      const aplicar = (nuevo: Estado) => setEstado((actual) => (actual.listo ? actual : nuevo));
      const token = await almacenDeToken.leer();
      if (!token) return aplicar({ listo: true, token: null, usuario: null });
      try {
        aplicar({ listo: true, token, usuario: await usuarioActualApi(token) });
      } catch (e) {
        // Solo un 401/403 invalida el token; un fallo de red o un 5xx conserva la sesión (sin datos de usuario).
        if (e instanceof ErrorApi && (e.estado === 401 || e.estado === 403)) {
          await almacenDeToken.borrar();
          aplicar({ listo: true, token: null, usuario: null });
        } else {
          aplicar({ listo: true, token, usuario: null });
        }
      }
    })();
  }, []);

  const iniciarSesion = useCallback<Contexto['iniciarSesion']>(async (correo, contrasena) => {
    const r = await iniciarSesionApi(correo.trim().toLowerCase(), contrasena);
    await almacenDeToken.guardar(r.token_acceso);
    setEstado({ listo: true, token: r.token_acceso, usuario: r.usuario });
  }, []);

  const cerrarSesion = useCallback(async () => {
    const token = estado.token;
    setEstado({ listo: true, token: null, usuario: null });
    await almacenDeToken.borrar();
    if (token) await cerrarSesionApi(token).catch(() => undefined); // best effort: el token ya no se usa
  }, [estado.token]);

  const conSesion = useCallback<Contexto['conSesion']>(
    async (llamada) => {
      if (!estado.token) throw new ErrorApi(401, 'sesion_invalida', 'Sesión inválida o expirada.');
      try {
        return await llamada(estado.token);
      } catch (e) {
        if (e instanceof ErrorApi && e.estado === 401) {
          await almacenDeToken.borrar();
          setEstado({ listo: true, token: null, usuario: null });
        }
        throw e;
      }
    },
    [estado.token],
  );

  const valor = useMemo(() => ({ ...estado, iniciarSesion, cerrarSesion, conSesion }), [estado, iniciarSesion, cerrarSesion, conSesion]);
  return <SesionContext.Provider value={valor}>{children}</SesionContext.Provider>;
}

export function useSesion(): Contexto {
  const c = useContext(SesionContext);
  if (!c) throw new Error('useSesion debe usarse dentro de <SesionProvider>.');
  return c;
}
