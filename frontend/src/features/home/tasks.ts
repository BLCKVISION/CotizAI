// Dependency-free on purpose so it runs in the plain-Node unit tests.
export const MIN_PROPOSALS = 3;

type Role = 'cargador' | 'evaluador' | 'aprobador' | 'auditor' | 'coordinador';
type ProjectLike = { id: string; nombre: string; estado: string; creado: string };

export type TaskKind = 'upload' | 'evaluate' | 'review' | 'decide' | 'close' | 'consult';
export type Task = {
  kind: TaskKind;
  projectId: string;
  /** What has to be done. */
  title: string;
  /** Where: the project name, plus context. */
  detail: string;
  /** Label of the button, naming what the person will do there. */
  action: string;
  /** Route that shows the control needed to finish the task. */
  path: string;
};

/** Lower goes first: decisions and ready evaluations before collecting more files. */
const PRIORITY: Record<TaskKind, number> = { decide: 0, evaluate: 1, review: 1, upload: 2, close: 3, consult: 4 };

function taskFor(role: Role, p: ProjectLike, count: number): Task | null {
  const make = (kind: TaskKind, title: string, action: string, extra = '', tab: 'propuestas' | 'revision' = 'propuestas'): Task => ({
    kind,
    projectId: p.id,
    title,
    detail: extra ? `${p.nombre} · ${extra}` : p.nombre,
    action,
    path: tab === 'revision' ? `/proyectos/${p.id}?tab=revision` : `/proyectos/${p.id}`,
  });

  if (p.estado === 'en_recepcion') {
    const missing = Math.max(0, MIN_PROPOSALS - count);
    if (missing > 0) return role === 'cargador' || role === 'coordinador' ? make('upload', missing === 1 ? 'Subir 1 propuesta más' : `Subir ${missing} propuestas más`, 'Subir') : null;
    return role === 'cargador' || role === 'evaluador' || role === 'coordinador' ? make('evaluate', 'Evaluar las propuestas', 'Evaluar', `${count} cargadas`) : null;
  }
  if (p.estado === 'en_revision_del_comite') {
    if (role === 'evaluador' || role === 'coordinador') return make('review', 'Revisar el resultado', 'Revisar');
    if (role === 'aprobador') return make('decide', 'Decidir la adjudicación', 'Decidir', '', 'revision');
    return role === 'auditor' ? make('consult', 'Consultar la revisión', 'Consultar', '', 'revision') : null;
  }
  if (p.estado === 'adjudicado' && role === 'aprobador') return make('close', 'Cerrar el proceso', 'Cerrar', '', 'revision');
  return null;
}

const newestFirst = <P extends ProjectLike>(projects: P[]) => [...projects].sort((a, b) => b.creado.localeCompare(a.creado));

/** What this role can do right now, derived only from real data. */
export function buildTasks(role: Role, projects: ProjectLike[], proposalsByProject: Record<string, number>): Task[] {
  return newestFirst(projects)
    .flatMap((p) => taskFor(role, p, proposalsByProject[p.id] ?? 0) ?? [])
    .sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind]);
}
