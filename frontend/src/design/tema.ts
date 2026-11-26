/**
 * Paleta «Relay claro» para CotizAI (solo tema claro).
 * Todo par texto/fondo cumple >= 4.5:1; bordes de control >= 3:1.
 * El lima solo lleva texto negro encima.
 */
export const paletaClara = {
  esquema: 'claro' as const,
  fondo: '#EFF1F5',
  superficie: '#FFFFFF',
  superficieAlta: '#F1F5F9',
  texto: '#0B1220',
  textoSuave: '#556070',
  borde: 'rgba(15,23,42,0.08)',
  bordeControl: '#64748B',
  primario: '#0F172A',
  primarioPresionado: '#000000',
  sobrePrimario: '#FFFFFF',
  foco: '#2563EB',
  lima: '#D4F938',
  limaPresionado: '#C5EE25',
  sobreLima: '#0B1220',
  halos: { durazno: 'rgba(254,215,170,0.38)', menta: 'rgba(187,247,208,0.30)' },
  exito: { texto: '#166534', fondo: '#DCFCE7' },
  aviso: { texto: '#92400E', fondo: '#FEF3C7' },
  info: { texto: '#1E40AF', fondo: '#DBEAFE' },
  neutro: { texto: '#334155', fondo: '#E2E8F0' },
  error: { texto: '#B91C1C', fondo: '#FEE2E2' },
};

export type Paleta = typeof paletaClara;

export function useTema(): Paleta {
  return paletaClara;
}
