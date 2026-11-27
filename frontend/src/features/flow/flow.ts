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
/** The steps the person sees, and only while a proposal is being evaluated and verified. */
export const EVALUATION_STEPS = STEPS.slice(2);

type Verdict = 'valida' | 'descartada' | 'pendiente_de_revision';
type FindingLike = { code: string; discards: boolean; reason: string; evidence: string; origin: string };
export type ItemLike = { proposal_id: string; filename: string; supplier: string | null; verdict: Verdict; findings: FindingLike[]; unverified?: string[] };
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
    // Without a finding, "yes" only when the server had the data to check it.
    const unknown = unreadable || (item.unverified?.includes(c.code) ?? false);
    const state: CheckState = reasons.some((f) => f.discards) ? 'no' : reasons.length > 0 ? 'doubt' : unknown ? 'unchecked' : 'yes';
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

/** Each finding in everyday words, to finish the sentence "no la recomendamos porque…". */
const PLAIN_PROBLEMS: Record<string, string> = {
  MANIPULACION: 'contiene instrucciones dirigidas a la inteligencia artificial para alterar la evaluación',
  COMPAT: 'ofrece componentes que no son compatibles entre sí',
  ALCANCE: 'no cubre todo lo que pide el proyecto',
  CAPACIDAD: 'la protección o la energía prevista no soporta los equipos',
  CALIDAD: 'los equipos no corresponden a la calidad o condición que se cobra',
  ABUSIVO: 'incluye precios o cláusulas abusivas',
  ARITMETICA: 'sus cuentas no cuadran',
};

const joinList = (parts: string[]) => (parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join('; ')} y ${parts[parts.length - 1]}`);

/** The discarding problems of one proposal, once each, in the order of the control questions. */
export function plainProblems(item: ItemLike): string[] {
  const found = new Set(item.findings.filter((f) => f.discards).map((f) => f.code));
  return CHECKS.filter((c) => found.has(c.code)).map((c) => PLAIN_PROBLEMS[c.code]);
}

/** Why a person's NO stands: their own words when they differ from the AI, otherwise what the rules found. */
function whyRejected<I extends ItemLike>(o: Outcome<I>): string {
  const problems = plainProblems(o.item);
  const comment = o.changed || problems.length === 0 ? o.reason : '';
  if (problems.length === 0) return `Motivo registrado en la verificación: «${comment.replace(/[.\s]+$/, '')}».`;
  return `No la recomendamos porque ${joinList(problems)}.`;
}

const UNVERIFIED: Record<string, string> = {
  CAPACIDAD: 'que la energía soporte los equipos',
  CALIDAD: 'que los equipos sean nuevos',
};

export type FinalAnswer = { approved: boolean; label: string; headline: string; paragraphs: string[] };

const nameOf = (i: ItemLike) => i.supplier ?? i.filename;

/** The verified answer in full sentences. `costOf` and `scoreOf` keep this file free of formatting rules. */
export function finalAnswer<I extends ItemLike>(list: Outcome<I>[], costOf: (item: I) => string | null, scoreOf: (item: I) => number | null = () => null): FinalAnswer {
  const best = recommendation(list);
  const total = list.length;
  const approved = list.filter((o) => o.approved).length;
  const reviewed = total === 1 ? 'Se revisó una propuesta' : `Se revisaron ${total} propuestas`;
  if (!best) {
    const paragraphs = [
      total === 1
        ? `${reviewed}, la de ${nameOf(list[0].item)}, y no fue aprobada en la verificación.`
        : `${reviewed} y ninguna fue aprobada en la verificación.`,
    ];
    if (total === 1) paragraphs.push(whyRejected(list[0]));
    paragraphs.push('Antes de adjudicar, pida una cotización corregida o agregue propuestas de otros proveedores.');
    return { approved: false, label: 'No recomendamos adjudicar', headline: total === 1 ? 'Esta propuesta no cumple' : 'Ninguna propuesta cumple', paragraphs };
  }
  const cost = costOf(best.item);
  const score = scoreOf(best.item);
  const figures = [cost ? `un costo real de ${cost}` : null, score !== null ? `${score} puntos de 100` : null].filter((x): x is string => x !== null);
  const paragraphs = [
    total === 1
      ? `${reviewed} y fue aprobada en la verificación.`
      : `${reviewed}: ${approved} ${approved === 1 ? 'quedó aprobada' : 'quedaron aprobadas'} y ${total - approved} ${total - approved === 1 ? 'rechazada' : 'rechazadas'}.`,
    `La opción recomendada es ${nameOf(best.item)}${figures.length > 0 ? `, con ${figures.join(' y ')}` : ''}.`,
  ];
  if (best.changed) paragraphs.push(`La IA no la daba por válida; la persona que verificó la aprobó y explicó: «${best.reason.replace(/[.\s]+$/, '')}».`);
  const unverified = CHECKS.filter((c) => best.item.unverified?.includes(c.code)).map((c) => UNVERIFIED[c.code]).filter(Boolean);
  if (unverified.length > 0) paragraphs.push(`Antes de adjudicar, confirme lo que no se pudo verificar: ${joinList(unverified)}.`);
  return { approved: true, label: 'Propuesta recomendada', headline: nameOf(best.item), paragraphs };
}
