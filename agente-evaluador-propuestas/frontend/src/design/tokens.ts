/** Tokens de escala (independientes del color). Los colores viven en tema.ts. Ver design-system/agente-evaluador/RELAY-LIGHT.md */
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48, xxxl: 64 } as const; // ritmo de 4/8
export const radius = { sm: 8, md: 12, nav: 15, lg: 18, xl: 24, panel: 28, pill: 999 } as const;
export const touchSize = 48; // >= 44pt iOS / 48dp Android
export const icon = { sm: 16, md: 20, lg: 24, xl: 32 } as const;
export const maxContentWidth = 1120;
export const maxReadingWidth = 640;
export const floatMargin = 14; // separación del sidebar y paneles flotantes respecto al borde

/** Breakpoints: móvil < 640 ≤ tableta < 1024 ≤ escritorio */
export const breakpoint = { tablet: 640, desktop: 1024 } as const;

/** Movimiento (mismos valores que Relay: relayStaggerIn 500 ms, cubic-bezier(.16,1,.3,1)). */
export const motion = {
  input: 500,
  step: 60,
  transition: 250,
  counter: 900,
  entryDistance: 18,
  /** Curva «ease-out expo» de Relay. */
  curve: [0.16, 1, 0.3, 1] as const,
} as const;

export const source = {
  display: 'Urbanist_300Light',
  regular: 'Urbanist_400Regular',
  medium: 'Urbanist_500Medium',
  bold: 'Urbanist_600SemiBold',
  extra: 'Urbanist_700Bold',
} as const;

export const text = {
  hero: { fontFamily: source.display, fontSize: 44, lineHeight: 50, letterSpacing: -1.4 },
  title: { fontFamily: source.display, fontSize: 34, lineHeight: 40, letterSpacing: -1.1 },
  subtitle: { fontFamily: source.medium, fontSize: 20, lineHeight: 28, letterSpacing: -0.3 },
  body: { fontFamily: source.regular, fontSize: 16, lineHeight: 24 },
  bodyMedium: { fontFamily: source.medium, fontSize: 16, lineHeight: 24 },
  label: { fontFamily: source.bold, fontSize: 14, lineHeight: 20 },
  small: { fontFamily: source.regular, fontSize: 14, lineHeight: 20 },
  eyebrow: { fontFamily: source.bold, fontSize: 12, lineHeight: 16, letterSpacing: 1.2 },
  metric: { fontFamily: source.display, fontSize: 48, lineHeight: 52, letterSpacing: -1.6 },
} as const;
