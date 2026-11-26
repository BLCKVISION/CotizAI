import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ErrorApi } from '@/core/api/cliente';
import { useSesion } from '@/core/sesion/SesionProvider';

export const mensajeDeError = (e: unknown) =>
  e instanceof ErrorApi ? `${e.message}${e.trackId ? ` (ref. ${e.trackId})` : ''}` : 'Error inesperado.';

/** Consulta autenticada que se repite al volver a la pantalla o al llamar `recargar`. `clave` identifica la consulta. */
export function useDatos<T>(llamada: (token: string) => Promise<T>, clave = '') {
  const { conSesion } = useSesion();
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const actual = useRef(llamada);
  useEffect(() => {
    actual.current = llamada;
  });

  useFocusEffect(
    useCallback(() => {
      let vigente = true;
      conSesion((t) => actual.current(t))
        .then((d) => {
          if (vigente) {
            setDatos(d);
            setError(null);
          }
        })
        .catch((e) => vigente && setError(mensajeDeError(e)));
      return () => {
        vigente = false;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conSesion, clave, intento]),
  );

  return { datos, error, recargar: useCallback(() => setIntento((n) => n + 1), []) };
}
