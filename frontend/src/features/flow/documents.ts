// Dependency-free on purpose so it runs in the plain-Node unit tests.
export type DocumentStatus = 'new' | 'to_verify' | 'verified';

/** Every uploaded file with its place in the flow. Files not analysed yet come first: they are what just arrived. */
export function documentRows<P extends { id: string }>(
  proposals: P[],
  evaluatedIds: string[],
  verifiedIds: string[],
): { proposal: P; status: DocumentStatus }[] {
  const evaluated = new Set(evaluatedIds);
  const verified = new Set(verifiedIds);
  const rows = proposals.map((proposal) => {
    const status: DocumentStatus = !evaluated.has(proposal.id) ? 'new' : verified.has(proposal.id) ? 'verified' : 'to_verify';
    return { proposal, status };
  });
  return [...rows.filter((r) => r.status === 'new'), ...rows.filter((r) => r.status !== 'new')];
}
