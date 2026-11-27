// Dependency-free on purpose so it runs in the plain-Node unit tests.
/** The guided path of a purchase and the fixed "why yes / why no" template. Only the information changes. */
export const MIN_PROPOSALS = 1;
/** The server rejects larger batches. */
export const MAX_PER_RUN = 5;

export const STEPS = [
  { id: 'project', label: 'Proyecto' },
  { id: 'proposals', label: 'Propuestas' },
  { id: 'analysis', label: 'Análisis de la IA' },
  { id: 'verification', label: 'Su verificación' },
  { id: 'result', label: 'Resultado' },
] as const;
export type StepId = (typeof STEPS)[number]['id'];

type Verdict = 'valida' | 'descartada' | 'pendiente_de_revision';
type FindingLike = { code: string; discards: boolean; reason: string; evidence: string; origin: string };
export type ItemLike = { proposal_id: string; filename: string; supplier: string | null; verdict: Verdict; findings: FindingLike[] };
export type DecisionLike = { proposal_id: string; approved: boolean; comment: string };

type Progress = { proposalCount: number; hasEvaluation: boolean; items: ItemLike[]; decisions: DecisionLike[] };

/** Where the person is: the first step that still needs something from them. */
export function currentStep({ proposalCount, hasEvaluation, items, decisions }: Progress): StepId {
  if (!hasEvaluation) return proposalCount < MIN_PROPOSALS ? 'proposals' : 'analysis';
  return pendingVerification(items, decisions).length > 0 ? 'verification' : 'result';
}

export function pendingVerification<I extends ItemLike>(items: I[], decisions: DecisionLike[]): I[] {
  const decided = new Set(decisions.map((d) => d.proposal_id));
  return items.filter((i) => !decided.has(i.proposal_id));
}

/** The same checks, in the same order, for every proposal. */
export const CHECKS = [
  { code: 'ALCANCE', question: '¿Cubre todo lo que pide el proyecto?' },
  { code: 'COMPAT', question: '¿Sus componentes son compatibles?' },
  { code: 'CAPACIDAD', question: '¿La energía soporta los equipos?' },
  { code: 'CALIDAD', question: '¿Son equipos nuevos y de la calidad cobrada?' },
  { code: 'ABUSIVO', question: '¿Precios, envío y cláusulas son razonables?' },
  { code: 'ARITMETICA', question: '¿Las cuentas cuadran?' },
  { code: 'MANIPULACION', question: '¿Está libre de instrucciones ocultas para la IA?' },
] as const;

export type CheckState = 'yes' | 'no' | 'doubt' | 'unchecked';
export type Check = { code: string; question: string; state: CheckState; reasons: FindingLike[] };

/** `unreadable` proposals were never checked: showing them as passed would be false. */
export function checklist(item: ItemLike): Check[] {
  const unreadable = item.verdict === 'pendiente_de_revision' && item.findings.every((f) => f.code === 'LECTURA');
  return CHECKS.map((c) => {
    const reasons = item.findings.filter((f) => f.code === c.code);
    const state: CheckState = reasons.some((f) => f.discards) ? 'no' : reasons.length > 0 ? 'doubt' : unreadable ? 'unchecked' : 'yes';
    return { code: c.code, question: c.question, state, reasons };
  });
}

export const ANSWERS: Record<Verdict, { short: string; headline: string; why: string }> = {
  valida: { short: 'SÍ', headline: 'La IA dice que SÍ cumple', why: 'Por qué sí' },
  descartada: { short: 'NO', headline: 'La IA dice que NO cumple', why: 'Por qué no' },
  pendiente_de_revision: { short: '?', headline: 'La IA no puede decidir: necesita su revisión', why: 'Por qué no pudo decidir' },
};

/** The AI's reasons in one list: what discards first, then what needs attention. */
export function mainReasons(item: ItemLike): FindingLike[] {
  return [...item.findings].sort((a, b) => Number(b.discards) - Number(a.discards));
}

export type Outcome<I extends ItemLike> = { item: I; approved: boolean; reason: string; changed: boolean };

/** Final answer per proposal: the person's decision, explained by their comment or by the AI's main reason. */
export function outcomes<I extends ItemLike>(items: I[], decisions: DecisionLike[]): Outcome<I>[] {
  const byId = new Map(decisions.map((d) => [d.proposal_id, d]));
  return items.flatMap((item) => {
    const d = byId.get(item.proposal_id);
    if (!d) return [];
    const ai = mainReasons(item)[0]?.reason;
    const fallback = d.approved ? 'Cumple las verificaciones del proyecto.' : (ai ?? 'No cumple.');
    return [{ item, approved: d.approved, reason: d.comment || fallback, changed: d.approved !== (item.verdict === 'valida') }];
  });
}

/** Items come ranked from the server, so the recommendation is the first one the person approved. */
export const recommendation = <I extends ItemLike>(list: Outcome<I>[]) => list.find((o) => o.approved) ?? null;

/** Default batch: the proposals not analysed yet (all of them the first time), up to the limit. */
export function defaultSelection(proposalIds: string[], evaluatedIds: string[]): string[] {
  const done = new Set(evaluatedIds);
  const fresh = proposalIds.filter((id) => !done.has(id));
  return (fresh.length > 0 ? fresh : proposalIds).slice(0, MAX_PER_RUN);
}

export function selectionProblem(selected: number, total: number): string | null {
  if (total < MIN_PROPOSALS) return 'Agregue al menos una propuesta.';
  if (selected === 0) return 'Elija al menos una propuesta.';
  if (selected > MAX_PER_RUN) return `Máximo ${MAX_PER_RUN} propuestas por tanda.`;
  return null;
}
