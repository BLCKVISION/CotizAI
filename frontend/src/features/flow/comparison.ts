// Dependency-free on purpose so it runs in the plain-Node unit tests.
/** Compares the evaluated proposals and points to the best one. Same rule as the downloadable report. */
export type ComparableItem = {
  proposal_id: string;
  filename: string;
  supplier: string | null;
  verdict: string;
  score: string | null;
  real_cost: string | null;
  currency: string | null;
  converted_cost: string | null;
};
export type ComparisonDecision = { proposal_id: string; approved: boolean };
export type ComparisonStatus = 'approved' | 'rejected' | 'pending';
export type ComparisonRow<I> = { item: I; status: ComparisonStatus; cost: number | null; difference: number | null; isBest: boolean };

const comparableCost = (item: ComparableItem, currency: string) => {
  const value = item.converted_cost ?? (item.currency === currency ? item.real_cost : null);
  return value === null ? null : Number(value);
};

/** Items arrive ranked: the best is the first one approved, or valid and still waiting for verification. */
export function compareProposals<I extends ComparableItem>(items: I[], decisions: ComparisonDecision[], currency: string) {
  const byId = new Map(decisions.map((d) => [d.proposal_id, d.approved]));
  const best = items.find((i) => byId.get(i.proposal_id) ?? i.verdict === 'valida') ?? null;
  const bestCost = best ? comparableCost(best, currency) : null;
  const rows: ComparisonRow<I>[] = items.map((item) => {
    const approved = byId.get(item.proposal_id);
    const cost = comparableCost(item, currency);
    return {
      item,
      status: approved === undefined ? 'pending' : approved ? 'approved' : 'rejected',
      cost,
      // Rounded to cents: binary floating point would otherwise show 0,0000001 differences.
      difference: cost === null || bestCost === null ? null : Math.round((cost - bestCost) * 100) / 100,
      isBest: item === best,
    };
  });
  return { rows, best: rows.find((r) => r.isBest) ?? null, pending: rows.filter((r) => r.status === 'pending').length };
}
