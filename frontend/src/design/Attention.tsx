/** A periodic "look at me": every 20 s a light band crosses the card and its figure moves a little. */
import { useEffect, useState } from 'react';
import { Animated, Easing, Platform, View } from 'react-native';

import { soloWeb, useReducirMovimiento } from './efectos';
import { tint } from './tema';

const PERIOD_MS = 20_000;
const SWEEP_MS = 1300;
/** First pass shortly after the entrance animation; neighbours follow one another. */
const FIRST_MS = 2500;
const STAGGER_MS = 160;

/** 0 → 1 once per period. Stays at 0 when the person asks for reduced motion. */
export function useAttention(index = 0) {
  const reduce = useReducirMovimiento();
  const [pulse] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduce) return;
    const run = () => {
      pulse.setValue(0);
      Animated.timing(pulse, { toValue: 1, duration: SWEEP_MS, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }).start();
    };
    let every: ReturnType<typeof setInterval> | undefined;
    const first = setTimeout(() => {
      run();
      every = setInterval(run, PERIOD_MS);
    }, FIRST_MS + index * STAGGER_MS);
    return () => {
      clearTimeout(first);
      clearInterval(every);
      pulse.stopAnimation();
    };
  }, [pulse, reduce, index]);
  return pulse;
}

/** Small side-to-side rock used by the figure while the light passes. */
export const wiggle = (pulse: Animated.Value) => ({
  transform: [
    { rotate: pulse.interpolate({ inputRange: [0, 0.2, 0.45, 0.7, 0.88, 1], outputRange: ['0deg', '-7deg', '6deg', '-3deg', '1deg', '0deg'] }) },
    { translateY: pulse.interpolate({ inputRange: [0, 0.35, 0.7, 1], outputRange: [0, -6, -1, 0] }) },
  ],
});

/** The light band. Place it as the last child of a card that hides its overflow. */
export function Sheen({ pulse }: { pulse: Animated.Value }) {
  if (Platform.OS !== 'web') return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' }}>
      <Animated.View style={{ position: 'absolute', top: -60, bottom: -60, width: '45%', left: pulse.interpolate({ inputRange: [0, 1], outputRange: ['-70%', '150%'] }), opacity: pulse.interpolate({ inputRange: [0, 0.08, 0.92, 1], outputRange: [0, 1, 1, 0] }), transform: [{ rotate: '18deg' }] }}>
        <View style={{ flex: 1, ...soloWeb({ backgroundImage: `linear-gradient(90deg, ${tint.sky(0)} 0%, ${tint.sky(0.38)} 35%, ${tint.white(0.95)} 50%, ${tint.mintSoft(0.38)} 65%, ${tint.mintSoft(0)} 100%)` }) }} />
      </Animated.View>
    </View>
  );
}
