/** The five steps of a purchase. Finished steps can be reopened. */
import { Pressable, View } from 'react-native';

import { Icono, Texto } from '@/design/componentes';
import { accentGradient, soloWeb } from '@/design/efectos';
import { useTema } from '@/design/tema';
import { espacio, radio } from '@/design/tokens';

import { type StepId, STEPS } from './flow';

type PressState = { pressed: boolean; hovered?: boolean; focused?: boolean };

export function Stepper({ active, reached, onSelect }: { active: StepId; reached: StepId; onSelect: (step: StepId) => void }) {
  const t = useTema();
  const limit = STEPS.findIndex((s) => s.id === reached);
  const activeIndex = STEPS.findIndex((s) => s.id === active);
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: espacio.sm }}>
      {STEPS.map((step, i) => {
        const open = i > 0 && i <= Math.max(limit, 1);
        const done = i < limit || i === 0;
        const isActive = i === activeIndex;
        return (
          <Pressable
            key={step.id}
            accessibilityRole="tab"
            accessibilityLabel={`Paso ${i + 1}: ${step.label}`}
            accessibilityState={{ selected: isActive, disabled: !open }}
            aria-selected={isActive}
            disabled={!open}
            onPress={() => onSelect(step.id)}
            style={(e: PressState) => ({ flex: 1, minWidth: 0, gap: 6, opacity: open || done ? 1 : 0.45, borderRadius: radio.sm, borderWidth: 2, borderColor: e.focused ? t.foco : 'transparent' })}
          >
            <View style={{ height: 6, borderRadius: 3, backgroundColor: 'rgba(15,23,42,0.08)', ...(done || isActive ? accentGradient(90) : null) }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: isActive ? t.primario : done ? t.accent : '#FFFFFF', ...soloWeb({ transitionProperty: 'background-color', transitionDuration: '300ms' }) }}>
                {done && !isActive ? (
                  <Icono nombre="check" tamano="sm" color={t.onAccent} />
                ) : (
                  <Texto variante="etiqueta" color={isActive ? '#FFFFFF' : t.textoSuave} style={{ fontSize: 11, lineHeight: 14 }}>
                    {i + 1}
                  </Texto>
                )}
              </View>
              <Texto variante={isActive ? 'etiqueta' : 'pequeno'} suave={!isActive} numberOfLines={1} style={{ flexShrink: 1 }}>
                {step.label}
              </Texto>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
