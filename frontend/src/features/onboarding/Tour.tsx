/** Animated intro: four short scenes that show how to use CotizAI. Skippable and replayable. */
import { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Pressable, View } from 'react-native';

import { Boton, Icono, type NombreIcono, Texto } from '@/design/componentes';
import { accentGradient, soloWeb, useReducirMovimiento } from '@/design/efectos';
import { SPLASH_MS } from '@/design/Splash';
import { useTema } from '@/design/tema';
import { espacio, radio } from '@/design/tokens';

import { hasSeenTour, markTourSeen, onOpenTour } from './tourStore';

type Scene = 'create' | 'upload' | 'review' | 'decide';
const SLIDES: { scene: Scene; title: string; text: string }[] = [
  { scene: 'create', title: '1. Cree su proyecto', text: 'Pulse «Nuevo proyecto» y describa qué va a comprar y dónde. Cada proyecto es una carpeta.' },
  { scene: 'upload', title: '2. Suba las propuestas', text: 'Suba desde 1 archivo (se analizan hasta 5 por tanda) con «Agregar propuestas»: fotos, PDF o Excel. Se guardan cifrados.' },
  { scene: 'review', title: '3. Evalúe', text: 'El agente revisará cálculos, costos ocultos y condiciones, citando la evidencia.' },
  { scene: 'decide', title: '4. El comité decide', text: 'Evaluadores y aprobadores dejan notas y cierran el proceso. Cada acción queda registrada.' },
];

/** 0 → 1 loop that drives the scene; frozen at its final pose with reduced motion. */
function useLoop(scene: Scene) {
  const reduce = useReducirMovimiento();
  const [value] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduce) {
      value.setValue(0.75);
      return;
    }
    value.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        Animated.delay(500),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [value, reduce, scene]);
  return value;
}

function Sheet({ icon }: { icon: NombreIcono }) {
  return (
    <View style={{ width: 58, height: 72, borderRadius: 12, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#0E4F6E', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } }}>
      <Icono nombre={icon} />
    </View>
  );
}

function Stage({ scene }: { scene: Scene }) {
  const p = useLoop(scene);
  const t = useTema();
  const at = (input: number[], output: number[]) => p.interpolate({ inputRange: input, outputRange: output });
  const folder = (
    <View style={{ width: 150, height: 96 }}>
      <View style={{ position: 'absolute', top: 0, left: 0, width: 66, height: 26, borderTopLeftRadius: 14, borderTopRightRadius: 18, backgroundColor: 'rgba(255,255,255,0.92)' }} />
      <View style={{ position: 'absolute', top: 16, left: 0, right: 0, bottom: 0, borderRadius: 18, borderTopLeftRadius: 0, backgroundColor: 'rgba(255,255,255,0.92)' }} />
    </View>
  );
  return (
    <View style={{ height: 210, borderRadius: radio.xl, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', ...accentGradient(135) }}>
      {scene === 'create' ? (
        <Animated.View style={{ opacity: at([0, 0.25, 1], [0, 1, 1]), transform: [{ scale: at([0, 0.45, 0.6, 1], [0.6, 1.08, 1, 1]) }] }}>
          {folder}
          <Animated.View style={{ position: 'absolute', right: -18, bottom: -16, width: 46, height: 46, borderRadius: 23, backgroundColor: t.primario, alignItems: 'center', justifyContent: 'center', transform: [{ scale: at([0, 0.5, 0.7, 1], [0, 0, 1, 1]) }] }}>
            <Icono nombre="plus" color="#FFFFFF" />
          </Animated.View>
        </Animated.View>
      ) : scene === 'upload' ? (
        <View style={{ alignItems: 'center', justifyContent: 'flex-end', height: 190 }}>
          {(['image', 'file-text', 'grid'] as const).map((icon, i) => {
            const start = i * 0.18;
            return (
              <Animated.View
                key={icon}
                style={{
                  position: 'absolute',
                  top: 8,
                  opacity: at([0, start + 0.01, start + 0.12, start + 0.5, start + 0.62, 1], [0, 0, 1, 1, 0, 0]),
                  transform: [{ translateX: (i - 1) * 76 }, { translateY: at([0, start + 0.12, start + 0.62, 1], [0, 0, 88, 88]) }],
                }}
              >
                <Sheet icon={icon} />
              </Animated.View>
            );
          })}
          <View style={{ marginBottom: 12 }}>{folder}</View>
        </View>
      ) : scene === 'review' ? (
        <View style={{ flexDirection: 'row', gap: 18 }}>
          <Sheet icon="file-text" />
          <Sheet icon="percent" />
          <Sheet icon="globe" />
          <Animated.View style={{ position: 'absolute', top: 30, left: -8, width: 56, height: 56, borderRadius: 28, borderWidth: 4, borderColor: t.primario, backgroundColor: 'rgba(255,255,255,0.35)', transform: [{ translateX: at([0, 1], [0, 160]) }] }} />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 22 }}>
          <Sheet icon="users" />
          <Animated.View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: t.primario, alignItems: 'center', justifyContent: 'center', transform: [{ scale: at([0, 0.3, 0.55, 0.7, 1], [0.3, 0.3, 1.12, 1, 1]) }], opacity: at([0, 0.3, 0.45, 1], [0, 0, 1, 1]) }}>
            <Icono nombre="check" tamano="xl" color="#FFFFFF" />
          </Animated.View>
        </View>
      )}
    </View>
  );
}

export function Tour() {
  const t = useTema();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (hasSeenTour()) return;
    const id = setTimeout(() => setVisible(true), SPLASH_MS + 500); // after the loading screen
    return () => clearTimeout(id);
  }, []);
  const [step, setStep] = useState(0);
  useEffect(
    () =>
      onOpenTour(() => {
        setStep(0);
        setVisible(true);
      }),
    [],
  );
  if (!visible) return null;
  const close = () => {
    markTourSeen();
    setVisible(false);
  };
  const slide = SLIDES[step];
  const last = step === SLIDES.length - 1;
  return (
    <Modal transparent visible animationType="fade" onRequestClose={close}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: espacio.md, backgroundColor: 'rgba(15,23,42,0.34)', ...soloWeb({ backdropFilter: 'blur(10px)' }) }}>
        <View accessibilityViewIsModal style={{ width: '100%', maxWidth: 520, backgroundColor: '#FFFFFF', borderRadius: radio.panel, padding: espacio.lg, gap: espacio.md }}>
          <Stage key={slide.scene} scene={slide.scene} />
          <View accessibilityLiveRegion="polite" style={{ gap: espacio.xs, minHeight: 96 }}>
            <Texto variante="subtitulo" accessibilityRole="header" style={{ fontFamily: 'Urbanist_600SemiBold' }}>
              {slide.title}
            </Texto>
            <Texto suave>{slide.text}</Texto>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espacio.md }}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {SLIDES.map((s, i) => (
                <Pressable key={s.scene} accessibilityRole="button" accessibilityLabel={`Ir al paso ${i + 1}`} hitSlop={10} onPress={() => setStep(i)} style={{ width: i === step ? 24 : 8, height: 8, borderRadius: 4, backgroundColor: i === step ? t.accentStrong : '#D5DBE3', ...soloWeb({ transitionProperty: 'width', transitionDuration: '280ms' }) }} />
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: espacio.sm }}>
              {last ? null : <Boton etiqueta="Saltar" variante="fantasma" onPress={close} />}
              <Boton etiqueta={last ? 'Empezar' : 'Siguiente'} icono={last ? 'check' : 'arrow-right'} onPress={last ? close : () => setStep((s) => s + 1)} />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
