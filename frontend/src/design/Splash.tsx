/** Loading screen with the CotizAI logo: shown while the app starts and right after signing in. */
import { useEffect, useState } from 'react';
import { Animated, Easing, View } from 'react-native';

import { Isotype, Wordmark } from './Brand';
import { accentGradient, soloWeb, useReducirMovimiento } from './efectos';
import { useTema } from './tema';

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
      style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 100, alignItems: 'center', justifyContent: 'center', gap: 36, backgroundColor: t.fondo, opacity: leaving ? 0 : 1, ...soloWeb({ transitionProperty: 'opacity', transitionDuration: `${FADE_MS}ms`, backgroundImage: 'radial-gradient(ellipse at 75% 20%, rgba(167,243,208,0.45) 0%, rgba(233,235,239,0) 55%), radial-gradient(ellipse at 20% 85%, rgba(125,211,252,0.45) 0%, rgba(233,235,239,0) 55%)' }) }}
    >
      <Animated.View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, opacity: intro, transform: [{ translateY: intro.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }}>
        <Isotype size={84} />
        <Wordmark height={44} />
      </Animated.View>
      <View style={{ width: TRACK, height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: 'rgba(15,23,42,0.08)' }}>
        <Animated.View style={{ width: 64, height: 4, borderRadius: 2, ...accentGradient(90), transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-64, TRACK] }) }] }} />
      </View>
    </View>
  );
}

/** Keeps the splash for a short minimum time whenever `trigger` changes, then fades it out. */
export function SplashGate({ ready, trigger }: { ready: boolean; trigger: string }) {
  const [phase, setPhase] = useState<{ key: string; step: 'show' | 'leaving' | 'done' }>({ key: trigger, step: 'show' });
  // A new trigger shows the splash again; adjusting state during render avoids a one-frame flash.
  if (phase.key !== trigger) setPhase({ key: trigger, step: 'show' });
  useEffect(() => {
    if (!ready) return;
    const leave = setTimeout(() => setPhase((p) => ({ ...p, step: 'leaving' })), SPLASH_MS);
    const done = setTimeout(() => setPhase((p) => ({ ...p, step: 'done' })), SPLASH_MS + FADE_MS);
    return () => {
      clearTimeout(leave);
      clearTimeout(done);
    };
  }, [ready, trigger]);
  return phase.step === 'done' ? null : <Splash leaving={phase.step === 'leaving'} />;
}
