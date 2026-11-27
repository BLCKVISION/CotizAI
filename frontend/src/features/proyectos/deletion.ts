// Dependency-free on purpose so it runs in the plain-Node unit tests.
/** Mirrors the server's rule, only to hide what it would refuse: an awarded purchase keeps its record. */
export function wasAwarded(project: { estado: string; motivo_de_cierre: string | null }): boolean {
  return project.estado === 'adjudicado' || (project.estado === 'cerrado' && !project.motivo_de_cierre);
}

export const canBeDeleted = (project: { estado: string; motivo_de_cierre: string | null }) => project.estado !== 'en_evaluacion' && !wasAwarded(project);
