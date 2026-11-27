// Dependency-free on purpose so it runs in the plain-Node unit tests.
/**
 * The server answers only when the whole evaluation ends, so what happens in between is an estimate from
 * the elapsed time. It never reaches 100 %: only the real answer completes the process.
 */
export const STAGES = [
  { id: 'read', label: 'Lectura de los documentos', detail: 'Texto, tablas, fotos y capturas', share: 0.55 },
  { id: 'math', label: 'Verificación aritmética', detail: 'Cantidad × precio y sumas', share: 0.1 },
  { id: 'scope', label: 'Alcance y compatibilidad', detail: 'Ítems exigidos y componentes', share: 0.2 },
  { id: 'cost', label: 'Costo real y moneda', detail: 'Fletes, recargos, impuestos y tasa', share: 0.07 },
  { id: 'rank', label: 'Puntaje y orden', detail: 'Válidas de mejor a peor y descartes', share: 0.08 },
] as const;

const MAX_ESTIMATED_PERCENT = 95;
const PARALLEL_FILES = 3; // the server reads this many proposals at once by default
const SECONDS_PER_ROUND = 11;
const FIXED_SECONDS = 6;

export const estimateSeconds = (files: number) => FIXED_SECONDS + Math.ceil(Math.max(1, files) / PARALLEL_FILES) * SECONDS_PER_ROUND;

export type EstimatedProgress = { percent: number; stage: number; remainingSeconds: number; overdue: boolean };

export function estimateProgress(elapsedSeconds: number, files: number): EstimatedProgress {
  const total = estimateSeconds(files);
  const fraction = Math.max(0, elapsedSeconds) / total;
  let reached = 0;
  let stage: number = STAGES.length - 1;
  for (const [i, s] of STAGES.entries()) {
    reached += s.share;
    if (fraction < reached) {
      stage = i;
      break;
    }
  }
  return {
    percent: Math.min(MAX_ESTIMATED_PERCENT, Math.round(fraction * 100)),
    stage,
    remainingSeconds: Math.max(0, Math.ceil(total - elapsedSeconds)),
    overdue: elapsedSeconds > total,
  };
}
