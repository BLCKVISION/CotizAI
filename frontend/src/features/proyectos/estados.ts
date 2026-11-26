import type { NombreIcono, Tono } from '@/design/componentes';

import type { EstadoProyecto } from './api';

/** Cada estado combina color + icono + texto: el significado nunca depende solo del color. */
export const ESTADOS: Record<EstadoProyecto, { etiqueta: string; tono: Tono; icono: NombreIcono; descripcion: string }> = {
  en_recepcion: { etiqueta: 'En recepción', tono: 'neutro', icono: 'inbox', descripcion: 'Recibiendo propuestas' },
  en_evaluacion: { etiqueta: 'En evaluación', tono: 'info', icono: 'cpu', descripcion: 'El agente analiza las propuestas' },
  en_revision_del_comite: { etiqueta: 'En revisión', tono: 'aviso', icono: 'users', descripcion: 'El comité revisa los resultados' },
  adjudicado: { etiqueta: 'Adjudicado', tono: 'exito', icono: 'award', descripcion: 'Proveedor adjudicado' },
  cerrado: { etiqueta: 'Cerrado', tono: 'neutro', icono: 'lock', descripcion: 'Proceso cerrado' },
};

/** Tolera estados que el backend añada y el cliente aún no conozca. */
export const infoEstado = (estado: string) =>
  (ESTADOS as Record<string, (typeof ESTADOS)[EstadoProyecto]>)[estado] ?? {
    etiqueta: estado,
    tono: 'neutro' as Tono,
    icono: 'inbox' as NombreIcono,
    descripcion: 'Estado desconocido',
  };

export const ORDEN_DE_ESTADOS: EstadoProyecto[] = [
  'en_recepcion',
  'en_evaluacion',
  'en_revision_del_comite',
  'adjudicado',
  'cerrado',
];

export const formatoFecha = (iso: string) =>
  new Date(iso).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });

export const formatoMonto = (valor: string | null) =>
  valor === null ? 'No definido' : Number(valor).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
