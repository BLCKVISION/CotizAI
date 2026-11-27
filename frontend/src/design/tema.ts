/**
 * CotizAI light palette: neutral greys, glass surfaces and a blue accent.
 * Todo par texto/fondo cumple >= 4.5:1; bordes de control >= 3:1.
 * The accent always carries deep navy text.
 */
export const paletaClara = {
  esquema: 'claro' as const,
  fondo: '#E9EBEF',
  superficie: '#FFFFFF',
  superficieAlta: '#F1F5F9',
  texto: '#0B1220',
  textoSuave: '#556070',
  borde: 'rgba(15,23,42,0.08)',
  bordeControl: '#64748B',
  primario: '#0F172A',
  primarioPresionado: '#000000',
  sobrePrimario: '#FFFFFF',
  foco: '#0369A1',
  // Sky-blue to aqua accent. These are light tones: text on them is always deep navy (>= 7:1).
  accent: '#93DDF9',
  accentPressed: '#7DD3FC',
  onAccent: '#06283D',
  /** Darker step of the same hue for thin marks, borders and checks on white (>= 3:1). */
  accentStrong: '#0E8FA8',
  gradient: ['#A9DEFD', '#93E4F4', '#A4F4DD'] as const,
  /** Charts reuse the button gradient. The tones are light, so every bar also shows its value as text. */
  chart: ['#A9DEFD', '#93E4F4', '#A4F4DD'] as const,
  halos: { durazno: 'rgba(167,243,208,0.28)', menta: 'rgba(125,211,252,0.34)' },
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
