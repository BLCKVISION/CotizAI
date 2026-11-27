// Dependency-free on purpose so it runs in the plain-Node unit tests.
type Verdict = 'valida' | 'descartada' | 'pendiente_de_revision';
type ItemLike = {
  proposal_id: string;
  filename: string;
  supplier: string | null;
  verdict: Verdict;
  real_cost: string | null;
  currency: string | null;
  converted_cost: string | null;
  converted_currency: string | null;
};
type EvaluationLike = { project_id: string; evaluated_at: string; items: ItemLike[] };
type ProjectLike = { id: string; nombre: string };

export type VerifiedProposal = {
  id: string;
  projectId: string;
  /** Supplier name when the document states it, otherwise the file name. */
  title: string;
  projectName: string;
  verdict: Verdict;
  cost: string | null;
  currency: string | null;
};

export const MAX_VERIFIED = 8;

/** Proposals from the most recent evaluations first; inside one evaluation the ranking order is kept. */
export function latestVerified(evaluations: EvaluationLike[], projects: ProjectLike[], limit = MAX_VERIFIED): VerifiedProposal[] {
  const names = new Map(projects.map((p) => [p.id, p.nombre]));
  return [...evaluations]
    .sort((a, b) => b.evaluated_at.localeCompare(a.evaluated_at))
    .flatMap((e) =>
      e.items.map((i) => ({
        id: `${e.project_id}-${i.proposal_id}`,
        projectId: e.project_id,
        title: i.supplier ?? i.filename,
        projectName: names.get(e.project_id) ?? 'Proyecto',
        verdict: i.verdict,
        cost: i.converted_cost ?? i.real_cost,
        currency: i.converted_cost !== null ? i.converted_currency : i.currency,
      })),
    )
    .slice(0, limit);
}
