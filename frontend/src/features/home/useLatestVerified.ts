/** Latest verified proposals across projects. Only committee roles may read results; others get nothing. */
import { useDatos } from '@/core/useDatos';
import { ErrorApi } from '@/core/api/cliente';
import { getEvaluationApi } from '@/features/evaluations/api';
import { listarProyectosApi } from '@/features/proyectos/api';

import { latestVerified, type VerifiedProposal } from './verified';

/** States a project can be in after an evaluation; asking for the others would only return "not found". */
const MAY_HAVE_RESULTS = new Set(['en_revision_del_comite', 'adjudicado', 'cerrado']);

export function useLatestVerified(allowed: boolean) {
  const load = async (token: string): Promise<VerifiedProposal[]> => {
    if (!allowed) return [];
    const projects = await listarProyectosApi(token);
    const evaluations = await Promise.all(
      projects
        .filter((p) => MAY_HAVE_RESULTS.has(p.estado))
        .map((p) =>
          getEvaluationApi(p.id)(token).catch((e) => {
            if (e instanceof ErrorApi && e.estado === 404) return null; // moved by hand, never evaluated
            throw e;
          }),
        ),
    );
    return latestVerified(evaluations.filter((e) => e !== null), projects);
  };
  return useDatos(load, String(allowed));
}
