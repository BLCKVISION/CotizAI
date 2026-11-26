import type { IconName, Tone } from '@/design/components';

import type { ProjectState } from './api';

/** Cada estado combina color + icono + texto: el significado nunca depende solo del color. */
export const STATES: Record<ProjectState, { label: string; tone: Tone; icon: IconName; description: string }> = {
  receiving: { label: 'En recepción', tone: 'neutral', icon: 'inbox', description: 'Recibiendo propuestas' },
  evaluating: { label: 'En evaluación', tone: 'info', icon: 'cpu', description: 'El agente analiza las propuestas' },
  committee_review: { label: 'En revisión', tone: 'warning', icon: 'users', description: 'El comité revisa los resultados' },
  awarded: { label: 'Adjudicado', tone: 'success', icon: 'award', description: 'Proveedor adjudicado' },
  closed: { label: 'Cerrado', tone: 'neutral', icon: 'lock', description: 'Proceso cerrado' },
};

/** Tolera estados que el backend añada y el cliente aún no conozca. */
export const stateInfo = (state: string) =>
  (STATES as Record<string, (typeof STATES)[ProjectState]>)[state] ?? {
    label: state,
    tone: 'neutral' as Tone,
    icon: 'inbox' as IconName,
    description: 'Estado desconocido',
  };

export const STATE_ORDER: ProjectState[] = [
  'receiving',
  'evaluating',
  'committee_review',
  'awarded',
  'closed',
];

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });

export const formatAmount = (value: string | null) =>
  value === null ? 'No definido' : Number(value).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
