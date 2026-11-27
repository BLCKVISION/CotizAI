import type { Dato } from './graficos';
import { ESTADOS, ORDEN_DE_ESTADOS } from './projectStatus';

import type { Estadisticas } from '../core/api/management';

export const porEstado = (e: Estadisticas): Dato[] =>
  ORDEN_DE_ESTADOS.map((k) => ({ etiqueta: ESTADOS[k].etiqueta, valor: e.por_estado[k] }));
export const porFormato = (e: Estadisticas): Dato[] =>
  (['pdf', 'jpg', 'png', 'xlsx'] as const).map((k) => ({ etiqueta: k.toUpperCase(), valor: e.por_formato[k] }));
export const porUbicacion = (e: Estadisticas): Dato[] =>
  Object.entries(e.por_ubicacion).map(([etiqueta, valor]) => ({ etiqueta, valor }));
export const porMes = (e: Estadisticas): Dato[] =>
  Object.entries(e.por_mes).map(([m, valor]) => {
    const [anio, mes] = m.split('-').map(Number);
    const month = new Date(anio, mes - 1, 1).toLocaleDateString('es-VE', { month: 'short' }).replace('.', '');
    return { etiqueta: `${month} ${anio}`, valor }; // full year, so it does not read as a day
  });
