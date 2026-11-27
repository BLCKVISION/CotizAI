import { ErrorApi, peticionBinaria } from './cliente';

export type Calidad = 'alta' | 'media' | 'baja';
export type Transcripcion = { markdown: string; inciertos: string[]; calidad: Calidad; avisos: string[] };

/** Forma que devuelve el backend (POST /transcriptions). El mapeo al vocabulario del frontend vive solo aquí. */
type RespuestaServidor = {
  markdown?: string;
  uncertain?: string[];
  quality?: string;
  notices?: string[];
};

const CALIDAD: Record<string, Calidad> = { high: 'alta', medium: 'media', low: 'baja' };

export const aTranscripcion = (r: RespuestaServidor): Transcripcion => ({
  markdown: r.markdown ?? '',
  inciertos: r.uncertain ?? [],
  // Una calidad desconocida cuenta como baja: lo prudente es pedir revisión humana, no fiarse.
  calidad: CALIDAD[r.quality ?? ''] ?? 'baja',
  avisos: r.notices ?? [],
});

export const transcribirImagenApi = (nombre: string, archivo: Blob) => async (token: string) => {
  const respuesta = await peticionBinaria(`/transcriptions?archivo=${encodeURIComponent(nombre)}`, token, archivo);
  let datos: RespuestaServidor;
  try {
    datos = (await respuesta.json()) as RespuestaServidor;
  } catch {
    // 2xx que no es JSON (p. ej. el index.html de un proxy): no se entrega como si fuera una transcripción.
    throw new ErrorApi(respuesta.status, 'respuesta_invalida', 'El servidor devolvió una respuesta inesperada.');
  }
  return aTranscripcion(datos);
};
