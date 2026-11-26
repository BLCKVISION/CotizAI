import { Children, type ReactNode, useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, View, type ViewStyle } from 'react-native';

import { useTheme } from './theme';
import { motion } from './tokens';

const isWeb = Platform.OS === 'web';
const curve = Easing.bezier(...motion.curve);

/** Estilos solo-web (blur, gradientes, transiciones) que react-native-web admite pero RN no tipa. */
export const webOnly = (style: Record<string, string | number>): ViewStyle =>
  (isWeb ? style : {}) as unknown as ViewStyle;

/** true si el usuario pidió reducir el movimiento: toda animación debe omitirse. */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => live && setReduce(v));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

/** Tarjeta de cristal blanco de Relay: blanco .90, blur 28, borde blanco, sombra suave larga + luz interior. */
export function glass(options: { opacity?: number; blur?: number; radius: number; elevated?: boolean }): ViewStyle {
  const { opacity = 0.9, blur = 28, radius, elevated = false } = options;
  return {
    backgroundColor: `rgba(255,255,255,${opacity})`,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
    // Sombra nativa (iOS/Android); en web se sustituye por boxShadow compuesto.
    shadowColor: '#000',
    shadowOpacity: elevated ? 0.1 : 0.06,
    shadowRadius: elevated ? 22 : 15,
    shadowOffset: { width: 0, height: elevated ? 12 : 8 },
    elevation: elevated ? 6 : 3,
    ...webOnly({
      backdropFilter: `blur(${blur}px)`,
      WebkitBackdropFilter: `blur(${blur}px)`,
      boxShadow: elevated
        ? '0 14px 38px -4px rgba(0,0,0,.09), 0 4px 10px rgba(0,0,0,.03), inset 0 1px 1.5px #fff'
        : '0 8px 30px -4px rgba(0,0,0,.06), 0 2px 6px rgba(0,0,0,.02), inset 0 1px 1.5px #fff',
      transitionProperty: 'transform, box-shadow, background-color, border-color',
      transitionDuration: `${motion.transition}ms`,
      transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
    }),
  };
}

/** Fondo de la aplicación: #EFF1F5 con los dos halos pastel de Relay (durazno arriba-dcha., menta abajo-izq.). */
export function Background({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <View
      style={[
        { flex: 1, backgroundColor: t.background },
        webOnly({
          backgroundImage: `radial-gradient(ellipse at 85% 10%, ${t.halos.peach} 0%, rgba(239,241,245,0) 55%), radial-gradient(ellipse at 15% 85%, ${t.halos.mint} 0%, rgba(239,241,245,0) 50%)`,
          backgroundAttachment: 'fixed',
        }),
      ]}
    >
      {children}
    </View>
  );
}

/** Entrada «relayStaggerIn»: opacidad 0→1 y translateY(18)→0, con retardo por índice. */
export function Input({ index = 0, children, style }: { index?: number; children: ReactNode; style?: ViewStyle }) {
  const reduce = useReduceMotion();
  const [value] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduce) {
      value.setValue(1);
      return;
    }
    Animated.timing(value, {
      toValue: 1,
      duration: motion.input,
      delay: 30 + index * motion.step,
      easing: curve,
      useNativeDriver: true,
    }).start();
  }, [index, reduce, value]);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: value,
          transform: [
            { translateY: value.interpolate({ inputRange: [0, 1], outputRange: [motion.entryDistance, 0] }) },
            { scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.99, 1] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** Envuelve cada hijo directo en <Entrada> con escalones de 60 ms. */
export function Staggered({ children }: { children: ReactNode }) {
  return (
    <>
      {Children.toArray(children).map((child, i) => (
        <Input key={i} index={i}>
          {child}
        </Input>
      ))}
    </>
  );
}

/** Cifra que cuenta hasta su valor (si hay reduce-motion, aparece final). */
export function useCounter(target: number): number {
  const reduce = useReduceMotion();
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const v = new Animated.Value(0);
    const id = v.addListener(({ value }) => setValue(Math.round(value)));
    Animated.timing(v, { toValue: target, duration: motion.counter, easing: curve, useNativeDriver: false }).start();
    return () => v.removeListener(id);
  }, [target, reduce]);
  return reduce ? target : value;
}
