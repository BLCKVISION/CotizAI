import { Children, type ReactNode, useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, View, type ViewStyle } from 'react-native';

import { paletaClara, useTema } from './tema';
import { movimiento } from './tokens';

const esWeb = Platform.OS === 'web';
const curva = Easing.bezier(...movimiento.curva);

/** Estilos solo-web (blur, gradientes, transiciones) que react-native-web admite pero RN no tipa. */
export const soloWeb = (estilo: Record<string, string | number>): ViewStyle =>
  (esWeb ? estilo : {}) as unknown as ViewStyle;

/** true si el usuario pidió reducir el movimiento: toda animación debe omitirse. */
/** Read synchronously on web so the very first entrance animation already respects the preference. */
const prefersReducedMotion = () =>
  esWeb && typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

/** On web, also disables CSS transitions for users who ask for reduced motion. */
function installReducedMotionCss() {
  if (!esWeb || typeof document === 'undefined' || document.getElementById('cotizai-reduced-motion')) return;
  const style = document.createElement('style');
  style.id = 'cotizai-reduced-motion';
  style.textContent = '@media (prefers-reduced-motion: reduce){*,*::before,*::after{transition:none!important;animation:none!important}}';
  document.head.appendChild(style);
}

export function useReducirMovimiento(): boolean {
  const [reducir, setReducir] = useState(prefersReducedMotion);
  useEffect(() => {
    let vivo = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => vivo && setReducir(v));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducir);
    return () => {
      vivo = false;
      sub.remove();
    };
  }, []);
  return reducir;
}

/** Tarjeta de cristal blanco: blanco .90, blur 28, borde blanco, sombra suave larga + luz interior. */
export function vidrio(opciones: { opacidad?: number; blur?: number; radio: number; elevado?: boolean }): ViewStyle {
  const { opacidad = 0.9, blur = 28, radio, elevado = false } = opciones;
  return {
    backgroundColor: `rgba(255,255,255,${opacidad})`,
    borderRadius: radio,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
    // Sombra nativa (iOS/Android); en web se sustituye por boxShadow compuesto.
    shadowColor: '#000',
    shadowOpacity: elevado ? 0.1 : 0.06,
    shadowRadius: elevado ? 22 : 15,
    shadowOffset: { width: 0, height: elevado ? 12 : 8 },
    elevation: elevado ? 6 : 3,
    ...soloWeb({
      backdropFilter: `blur(${blur}px)`,
      WebkitBackdropFilter: `blur(${blur}px)`,
      boxShadow: elevado
        ? '0 14px 38px -4px rgba(0,0,0,.09), 0 4px 10px rgba(0,0,0,.03), inset 0 1px 1.5px #fff'
        : '0 8px 30px -4px rgba(0,0,0,.06), 0 2px 6px rgba(0,0,0,.02), inset 0 1px 1.5px #fff',
      transitionProperty: 'transform, box-shadow, background-color, border-color',
      transitionDuration: `${movimiento.transicion}ms`,
      transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
    }),
  };
}

/** Fondo de la aplicación: #EFF1F5 con los dos halos pastel (durazno arriba-dcha., menta abajo-izq.). */
/** CSS gradient for the accent panels (web); native falls back to the solid accent colour. */
export function accentGradient(angle = 135): ViewStyle {
  const [a, b, c] = paletaClara.gradient;
  return { backgroundColor: b, ...soloWeb({ backgroundImage: `linear-gradient(${angle}deg, ${a} 0%, ${b} 50%, ${c} 100%)` }) };
}

export function Fondo({ children }: { children: ReactNode }) {
  const t = useTema();
  useEffect(installReducedMotionCss, []);
  return (
    <View
      style={[
        { flex: 1, backgroundColor: t.fondo },
        soloWeb({
          backgroundImage: `radial-gradient(ellipse at 85% 10%, ${t.halos.durazno} 0%, rgba(239,241,245,0) 55%), radial-gradient(ellipse at 15% 85%, ${t.halos.menta} 0%, rgba(239,241,245,0) 50%)`,
          backgroundAttachment: 'fixed',
        }),
      ]}
    >
      {children}
    </View>
  );
}

/** Entrada escalonada: opacidad 0→1 y translateY(18)→0, con retardo por índice. */
export function Entrada({ indice = 0, children, estilo }: { indice?: number; children: ReactNode; estilo?: ViewStyle }) {
  const reducir = useReducirMovimiento();
  const [valor] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reducir) {
      valor.setValue(1);
      return;
    }
    Animated.timing(valor, {
      toValue: 1,
      duration: movimiento.entrada,
      delay: 30 + indice * movimiento.escalon,
      easing: curva,
      useNativeDriver: true,
    }).start();
  }, [indice, reducir, valor]);
  return (
    <Animated.View
      style={[
        estilo,
        {
          opacity: valor,
          transform: [
            { translateY: valor.interpolate({ inputRange: [0, 1], outputRange: [movimiento.distanciaEntrada, 0] }) },
            { scale: valor.interpolate({ inputRange: [0, 1], outputRange: [0.99, 1] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** Envuelve cada hijo directo en <Entrada> con escalones de 60 ms. */
export function Escalonado({ children }: { children: ReactNode }) {
  return (
    <>
      {Children.toArray(children).map((hijo, i) => (
        <Entrada key={i} indice={i}>
          {hijo}
        </Entrada>
      ))}
    </>
  );
}

/** Cifra que cuenta hasta su valor (si hay reduce-motion, aparece final). */
export function useContador(objetivo: number): number {
  const reducir = useReducirMovimiento();
  const [valor, setValor] = useState(0);
  useEffect(() => {
    if (reducir) return;
    const v = new Animated.Value(0);
    const id = v.addListener(({ value }) => setValor(Math.round(value)));
    Animated.timing(v, { toValue: objetivo, duration: movimiento.contador, easing: curva, useNativeDriver: false }).start();
    return () => v.removeListener(id);
  }, [objetivo, reducir]);
  return reducir ? objetivo : valor;
}
