import type { Finding, EvaluatedProposal, Result, Verdict } from './types';

export type Ranked = EvaluatedProposal & { position: number };
export type Organized = {
  recommended: Ranked | null;
  ranked: Ranked[]; // válidas y pendientes, en el orden del ranking
  discarded: EvaluatedProposal[];
};

/** Orden del ranking sin perder ni repetir propuestas: las que el ranking omita van al final, en su orden de llegada. */
function inOrder(r: Result): EvaluatedProposal[] {
  const byId = new Map(r.proposals.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const order: EvaluatedProposal[] = [];
  for (const id of [...r.ranking, ...r.proposals.map((p) => p.id)]) {
    const p = byId.get(id);
    if (p && !seen.has(id)) {
      seen.add(id);
      order.push(p);
    }
  }
  return order;
}

export function organize(r: Result): Organized {
  const order = inOrder(r);
  const ranked = order
    .filter((p) => p.verdict !== 'discarded')
    .map((p, i): Ranked => ({ ...p, position: i + 1 }));
  // Solo una propuesta válida se recomienda: una pendiente de revisión no tiene veredicto firme.
  const recommended = ranked.find((p) => p.verdict === 'valid') ?? null;
  return { recommended, ranked, discarded: order.filter((p) => p.verdict === 'discarded') };
}

/** Causas que descartan, con su motivo y la cita que las respalda (los avisos de lectura no descartan). */
export const discardsByCode = (p: EvaluatedProposal): Finding[] => p.findings.filter((h) => h.discards);

export const noticesOf = (p: EvaluatedProposal): Finding[] => p.findings.filter((h) => !h.discards);

/** Un costo con algún monto sin determinar no es el costo real: se muestra como parcial, nunca como cero. */
export const undeterminedCost = (p: EvaluatedProposal): boolean =>
  p.cost.total === null || p.cost.steps.some((step) => step.amount === null);

export const verdictTone = (v: Verdict): 'success' | 'error' | 'warning' =>
  v === 'valid' ? 'success' : v === 'discarded' ? 'error' : 'warning';

export const verdictLabel: Record<Verdict, string> = {
  valid: 'Válida',
  discarded: 'Descartada',
  pending_review: 'Pendiente de revisión',
};

export const CAUSES: Record<string, string> = {
  ALCANCE: 'No cubre el alcance',
  COMPAT: 'Componentes incompatibles',
  CAPACIDAD: 'Fuente o UPS insuficiente',
  CALIDAD: 'Calidad inferior a lo cobrado',
  ABUSIVO: 'Condiciones abusivas',
  ARITMETICA: 'Cifras que no coinciden',
  MANIPULACION: 'Instrucciones ocultas dirigidas a la IA',
  LECTURA: 'Lectura dudosa',
};

/** Por qué se recomienda esta propuesta, en palabras de la persona usuaria. Solo explica; no recalcula el orden. */
export function recommendationReason(o: Organized, delta: string): string {
  const r = o.recommended;
  if (!r) return 'Ninguna propuesta es válida: el comité debe revisar las pendientes o reabrir la convocatoria.';
  const score = (p: EvaluatedProposal) => Number(p.score ?? 0);
  const valid = o.ranked.filter((p) => p.verdict === 'valid');
  const best = valid.reduce((a, b) => (score(b) > score(a) ? b : a), r);
  if (best.id === r.id) return 'Mayor puntaje técnico entre las propuestas válidas.';
  return (
    `Equivalencia técnica: su puntaje está a ${(score(best) - score(r)).toFixed(2)} puntos de «${best.supplier ?? best.id}» ` +
    `(margen de ${delta} puntos), y a igual nivel técnico gana el menor costo real.`
  );
}
