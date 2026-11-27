// Dependency-free on purpose so it runs in the plain-Node unit tests.
const MIN_PROPOSALS = 3;

type ProjectLike = { id: string; nombre: string; estado: string; creado: string };
export type NotificationTone = 'action' | 'ready' | 'info';
export type AppNotification = { id: string; projectId: string; title: string; detail: string; tone: NotificationTone };

/**
 * Notices derived from the projects' current data. The id changes whenever the situation changes,
 * so the notice becomes unread again. Closed projects stay silent.
 */
export function buildNotifications(projects: ProjectLike[], proposalsByProject: Record<string, number>): AppNotification[] {
  return [...projects]
    .sort((a, b) => b.creado.localeCompare(a.creado))
    .flatMap((p): AppNotification[] => {
      const count = proposalsByProject[p.id] ?? 0;
      const notice = (key: string, title: string, detail: string, tone: NotificationTone) => [{ id: `${p.id}:${key}`, projectId: p.id, title, detail: `${p.nombre} · ${detail}`, tone }];
      if (p.estado === 'en_recepcion') {
        if (count >= MIN_PROPOSALS) return notice(`ready:${count}`, 'Listo para evaluar', `${count} propuestas cargadas`, 'ready');
        const missing = MIN_PROPOSALS - count;
        return notice(`missing:${count}`, 'Faltan propuestas', `${missing === 1 ? 'falta 1' : `faltan ${missing}`} para evaluar`, 'action');
      }
      if (p.estado === 'en_evaluacion') return notice(p.estado, 'Evaluación en curso', 'el agente está analizando', 'info');
      if (p.estado === 'en_revision_del_comite') return notice(p.estado, 'Pendiente del comité', 'los resultados esperan revisión', 'action');
      if (p.estado === 'adjudicado') return notice(p.estado, 'Proyecto adjudicado', 'la decisión quedó registrada', 'ready');
      return [];
    });
}
