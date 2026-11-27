/** Every raw colour of the product. Components use these names; they never write hex or rgba values. */
export const swatch = {
  green800: '#166534',
  slate550: '#556070',
  white: '#FFFFFF',
  black: '#000000',
  navy: '#0F172A',
  sky700: '#0369A1',
  deepNavy: '#06283D',
  night: '#0B1220',
  teal: '#0E8FA8',
  teal900: '#0E4F6E',
  blue800: '#1E40AF',
  blue700: '#1D4ED8',
  red700: '#B91C1C',
  red600: '#DC2626',
  amber600: '#D97706',
  slate400: '#8591A3',
  gray100: '#E9EBEF',
  mist: '#EFF1F5',
  blue100: '#DBEAFE',
  green100: '#DCFCE7',
  red100: '#FEE2E2',
  gray300: '#CBD3DE',
  slate300: '#CBD5E1',
  gray250: '#D5DBE3',
  mint100: '#CFFAE8',
  ice50: '#F0FBFE',
  sky300: '#8FD6FA',
  sky200: '#B9E6FF',
  aqua200: '#99E6F2',
  aqua250: '#A6E6F4',
  mint200: '#A8F3DD',
  gray200: '#E1E5EC',
  gray75: '#F1F3F7',
  gray50: '#F8F9FB',
} as const;

const translucent = (channels: string) => (alpha: number) => `rgba(${channels},${alpha})`;

/** The same colours with transparency: `tint.white(0.62)`. */
export const tint = {
  white: translucent('255,255,255'),
  navy: translucent('15,23,42'),
  black: translucent('0,0,0'),
  mist: translucent('239,241,245'),
  gray: translucent('233,235,239'),
  sky: translucent('147,221,249'),
  skyDeep: translucent('125,211,252'),
  mint: translucent('167,243,208'),
  mintSoft: translucent('164,244,221'),
  aqua: translucent('147,228,244'),
  teal: translucent('14,143,168'),
  blue: translucent('29,78,216'),
  azure: translucent('96,190,250'),
  ice: translucent('186,230,253'),
} as const;

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
