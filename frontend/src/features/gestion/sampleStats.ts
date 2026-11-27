/** Made-up figures to preview the statistics screen. Always shown under a visible "sample data" notice. */
import type { Estadisticas } from './api';

export const SAMPLE_STATS: Estadisticas = {
  total_proyectos: 7,
  total_propuestas: 34,
  total_proveedores: 12,
  por_estado: { en_recepcion: 3, en_evaluacion: 1, en_revision_del_comite: 1, adjudicado: 1, cerrado: 1 },
  por_formato: { pdf: 18, jpg: 7, png: 4, xlsx: 5 },
  por_ubicacion: { Caracas: 4, Maracaibo: 2, Valencia: 1 },
  por_mes: { '2026-08': 1, '2026-09': 1, '2026-10': 2, '2026-11': 3 },
  presupuestos: { USD: '48500.00', VES: '1250000.00' },
  propuestas_por_proyecto: {},
};
