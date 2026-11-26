/**
 * Paleta «Relay claro» para CotizAI (solo tema claro).
 * Todo par texto/fondo cumple >= 4.5:1; bordes de control >= 3:1.
 * El lima solo lleva texto negro encima.
 */
export const lightPalette = {
  schema: 'light' as const,
  background: '#EFF1F5',
  surface: '#FFFFFF',
  highSurface: '#F1F5F9',
  text: '#0B1220',
  softText: '#556070',
  border: 'rgba(15,23,42,0.08)',
  controlBorder: '#64748B',
  primary: '#0F172A',
  primaryPressed: '#000000',
  onPrimary: '#FFFFFF',
  focus: '#2563EB',
  lime: '#D4F938',
  limePressed: '#C5EE25',
  onLime: '#0B1220',
  halos: { peach: 'rgba(254,215,170,0.38)', mint: 'rgba(187,247,208,0.30)' },
  success: { text: '#166534', background: '#DCFCE7' },
  warning: { text: '#92400E', background: '#FEF3C7' },
  info: { text: '#1E40AF', background: '#DBEAFE' },
  neutral: { text: '#334155', background: '#E2E8F0' },
  error: { text: '#B91C1C', background: '#FEE2E2' },
};

export type Palette = typeof lightPalette;

export function useTheme(): Palette {
  return lightPalette;
}
