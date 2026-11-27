/** Loading screen with the CotizAI logo: shown on the first visit of the day. */
import { useEffect, useState } from 'react';
import { Animated, Easing, View } from 'react-native';

import { Logotype } from './Brand';
import { accentGradient, soloWeb, useReducirMovimiento } from './efectos';
import { markSplashShown } from './splashStore';
import { tint, useTema } from './tema';

export const SPLASH_MS = 1600;
const FADE_MS = 380;
const TRACK = 160;

export function Splash({ leaving = false }: { leaving?: boolean }) {
  const t = useTema();
  const reduce = useReducirMovimiento();
  const [intro] = useState(() => new Animated.Value(0));
  const [sweep] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduce) {
      intro.setValue(1);
      sweep.setValue(0.5);
      return;
    }
    Animated.timing(intro, { toValue: 1, duration: 700, easing: Easing.bezier(0.16, 1, 0.3, 1), useNativeDriver: true }).start();
    const loop = Animated.loop(Animated.timing(sweep, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [intro, sweep, reduce]);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Cargando CotizAI"
      pointerEvents={leaving ? 'none' : 'auto'}
      style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 100, alignItems: 'center', justifyContent: 'center', gap: 36, backgroundColor: t.fondo, opacity: leaving ? 0 : 1, ...soloWeb({ transitionProperty: 'opacity', transitionDuration: `${FADE_MS}ms`, backgroundImage: `radial-gradient(ellipse at 75% 20%, ${tint.mint(0.45)} 0%, ${tint.gray(0)} 55%), radial-gradient(ellipse at 20% 85%, ${tint.skyDeep(0.45)} 0%, ${tint.gray(0)} 55%)` }) }}
    >
      <Animated.View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, opacity: intro, transform: [{ translateY: intro.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }}>
        <Logotype height={60} />
      </Animated.View>
      <View style={{ width: TRACK, height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: tint.navy(0.08) }}>
        <Animated.View style={{ width: 64, height: 4, borderRadius: 2, ...accentGradient(90), transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-64, TRACK] }) }] }} />
      </View>
    </View>
  );
}

/** Keeps the splash for a short minimum time, then fades it out. */
export function SplashGate({ ready }: { ready: boolean }) {
  const [step, setStep] = useState<'show' | 'leaving' | 'done'>('show');
  useEffect(() => {
    if (!ready) return;
    const leave = setTimeout(() => setStep('leaving'), SPLASH_MS);
    const done = setTimeout(() => {
      markSplashShown();
      setStep('done');
    }, SPLASH_MS + FADE_MS);
    return () => {
      clearTimeout(leave);
      clearTimeout(done);
    };
  }, [ready]);
  return step === 'done' ? null : <Splash leaving={step === 'leaving'} />;
}
