/** Tokens de escala (independientes del color). Los colores viven en tema.ts. Ver design-system/agente-evaluador/RELAY-LIGHT.md */
export const espacio = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48, xxxl: 64 } as const; // ritmo de 4/8
export const radio = { sm: 8, md: 12, nav: 15, lg: 18, xl: 24, panel: 28, pildora: 999 } as const;
export const tamanoTactil = 48; // >= 44pt iOS / 48dp Android
export const icono = { sm: 16, md: 20, lg: 24, xl: 32 } as const;
export const anchoMaximoContenido = 1120;
export const anchoMaximoLectura = 640;
export const margenFlotante = 14; // separación del sidebar y paneles flotantes respecto al borde

/** Breakpoints: móvil < 640 ≤ tableta < 1024 ≤ escritorio */
export const puntoDeQuiebre = { tableta: 640, escritorio: 1024 } as const;

/** Movimiento (mismos valores que Relay: relayStaggerIn 500 ms, cubic-bezier(.16,1,.3,1)). */
export const movimiento = {
  entrada: 500,
  escalon: 60,
  transicion: 250,
  contador: 900,
  distanciaEntrada: 18,
  /** Curva «ease-out expo» de Relay. */
  curva: [0.16, 1, 0.3, 1] as const,
} as const;

export const fuente = {
  display: 'Urbanist_300Light',
  regular: 'Urbanist_400Regular',
  media: 'Urbanist_500Medium',
  negrita: 'Urbanist_600SemiBold',
  extra: 'Urbanist_700Bold',
} as const;

export const texto = {
  hero: { fontFamily: fuente.display, fontSize: 44, lineHeight: 50, letterSpacing: -1.4 },
  titulo: { fontFamily: fuente.display, fontSize: 34, lineHeight: 40, letterSpacing: -1.1 },
  subtitulo: { fontFamily: fuente.media, fontSize: 20, lineHeight: 28, letterSpacing: -0.3 },
  cuerpo: { fontFamily: fuente.regular, fontSize: 16, lineHeight: 24 },
  cuerpoMedio: { fontFamily: fuente.media, fontSize: 16, lineHeight: 24 },
  etiqueta: { fontFamily: fuente.negrita, fontSize: 14, lineHeight: 20 },
  pequeno: { fontFamily: fuente.regular, fontSize: 14, lineHeight: 20 },
  sobretitulo: { fontFamily: fuente.negrita, fontSize: 12, lineHeight: 16, letterSpacing: 1.2 },
  metrica: { fontFamily: fuente.display, fontSize: 48, lineHeight: 52, letterSpacing: -1.6 },
} as const;
