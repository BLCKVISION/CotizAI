// Dependency-free on purpose so it runs in the plain-Node unit tests.
type Role = 'cargador' | 'evaluador' | 'aprobador' | 'auditor';
type ProjectLike = { id: string; nombre: string; estado: string };
export type JourneyIcon =
  | 'shield' | 'search' | 'check-circle' | 'folder' | 'file-text' | 'award' | 'message-circle'
  | 'plus' | 'upload-cloud' | 'folder-plus' | 'cpu';

export type StepState = 'done' | 'current' | 'pending' | 'blocked';
/** What clicking a step does. */
export type StepTarget = 'create' | 'upload' | 'open' | 'audit';
export type Step = { title: string; detail: string; icon: JourneyIcon; state: StepState; target: StepTarget };
export type Journey<P extends ProjectLike = ProjectLike> = {
  steps: Step[];
  focus: P | null;
  /** The single primary action for this role, or a note when the role cannot act. */
  cta: { label: string; icon: JourneyIcon; path: string } | null;
  note: string;
};

export const MIN_PROPOSALS = 3;

/** Home's guided journey, derived only from real data. The focus is the newest project still in reception. */
export function buildJourney<P extends ProjectLike>(role: Role, projects: P[], proposalsByProject: Record<string, number>): Journey<P> {
  const focus = projects.find((p) => p.estado === 'en_recepcion') ?? projects[0] ?? null;
  const count = focus ? (proposalsByProject[focus.id] ?? 0) : 0;
  const ready = count >= MIN_PROPOSALS;
  const open = focus ? `/proyectos/${focus.id}` : '/proyectos';
  const evaluated = focus !== null && ['en_revision_del_comite', 'adjudicado', 'cerrado'].includes(focus.estado);

  if (role === 'auditor') {
    return {
      focus,
      cta: { label: 'Abrir auditoría', icon: 'shield', path: '/auditoria' },
      note: '',
      steps: [
        { title: 'Abra el registro', target: 'audit', detail: 'Todas las acciones del equipo', icon: 'shield', state: 'current' },
        { title: 'Revise quién y cuándo', target: 'audit', detail: 'Usuario, fecha y acción', icon: 'search', state: 'pending' },
        { title: 'Verifique la integridad', target: 'audit', detail: 'Huellas encadenadas · solo lectura', icon: 'check-circle', state: 'pending' },
      ],
    };
  }

  if (role === 'evaluador' || role === 'aprobador') {
    return {
      focus,
      cta: focus ? { label: 'Abrir el proyecto', icon: 'folder', path: open } : null,
      note: 'Un usuario con rol Cargador debe crear el primer proyecto.',
      steps: [
        { title: 'Abra un proyecto', target: 'open', detail: focus ? focus.nombre : 'Aún no hay proyectos', icon: 'folder', state: !focus ? 'pending' : evaluated ? 'done' : 'current' },
        { title: 'Revise las propuestas', target: 'open', detail: evaluated ? 'Ranking, hallazgos y evidencia' : focus ? `${count} propuestas cargadas` : 'Archivos y evidencia', icon: 'file-text', state: evaluated ? 'current' : 'pending' },
        {
          title: role === 'aprobador' ? 'Decida y cierre' : 'Anote y confirme', target: 'open',
          detail: evaluated ? 'En la revisión del comité' : 'Después de la evaluación',
          icon: role === 'aprobador' ? 'award' : 'message-circle',
          state: 'pending',
        },
      ],
    };
  }

  // cargador
  return {
    focus,
    cta: !focus
      ? { label: 'Crear el primer proyecto', icon: 'plus', path: '/proyectos/nuevo' }
      : evaluated
        ? { label: 'Ver el expediente', icon: 'folder', path: open }
        : { label: ready ? 'Evaluar propuestas' : 'Cargar propuestas', icon: ready ? 'cpu' : 'upload-cloud', path: open },
    note: '',
    steps: [
      { title: 'Cree el proyecto', target: 'create', detail: focus ? focus.nombre : 'Requerimiento, ubicación y presupuesto', icon: 'folder-plus', state: focus ? 'done' : 'current' },
      {
        title: 'Cargue las propuestas', target: 'upload',
        detail: focus ? `${count} de ${MIN_PROPOSALS} mínimas · hasta 20` : 'De 3 a 20 archivos por proyecto',
        icon: 'upload-cloud',
        state: !focus ? 'pending' : ready || evaluated ? 'done' : 'current',
      },
      {
        title: 'Evalúe y decida', target: 'open',
        detail: evaluated ? 'Evaluación realizada' : ready ? 'Listo para evaluar' : 'Con al menos 3 propuestas',
        icon: 'cpu',
        state: evaluated ? 'done' : ready ? 'current' : 'pending',
      },
    ],
  };
}
