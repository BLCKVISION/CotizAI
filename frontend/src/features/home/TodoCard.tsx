import { Pressable, ScrollView, View } from 'react-native';

import { Icono, Texto } from '@/design/componentes';
import { soloWeb } from '@/design/efectos';
import { innerSurface, Panel, RoundButton } from '@/design/Panel';
import { useTema } from '@/design/tema';
import { espacio, radio } from '@/design/tokens';

import type { Journey, Step } from './journey';

type PressState = { pressed: boolean; hovered?: boolean; focused?: boolean };

/** Checklist of the journey. Each row opens its own action; rows tick themselves from real data. */
export function TodoCard({ journey, onSelect }: { journey: Journey; onSelect: (step: Step) => void }) {
  const t = useTema();
  const today = new Date().toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' });
  const completed = journey.steps.filter((s) => s.state === 'done').length;
  const next = journey.steps.find((s) => s.state === 'current') ?? journey.steps.find((s) => s.state !== 'done') ?? journey.steps[0];
  return (
    <Panel
      title="Lista de tareas"
      subtitle={`${today.charAt(0).toUpperCase() + today.slice(1)} · ${completed} de ${journey.steps.length} listas`}
      actions={<RoundButton icon="arrow-up-right" label="Ir al siguiente paso" onPress={() => onSelect(next)} />}
    >
      <View style={innerSurface}>
        <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: journey.steps.length, now: completed }} style={{ height: 4, backgroundColor: t.superficieAlta }}>
          <View style={{ height: 4, width: `${(completed / journey.steps.length) * 100}%`, backgroundColor: t.accentStrong, ...soloWeb({ transitionProperty: 'width', transitionDuration: '700ms' }) }} />
        </View>
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: espacio.sm, paddingVertical: 2 }}>
          {journey.steps.map((s, i) => {
            const done = s.state === 'done';
            return (
              <Pressable
                key={s.title}
                accessibilityRole="button"
                accessibilityLabel={`${s.title}, ${done ? 'completada' : 'pendiente'}`}
                onPress={() => onSelect(s)}
                style={(e: PressState) => ({ flexDirection: 'row', alignItems: 'center', gap: espacio.sm, flexGrow: 1, minHeight: 44, paddingHorizontal: espacio.sm, borderRadius: radio.md, borderBottomWidth: i === journey.steps.length - 1 ? 0 : 1, borderBottomColor: t.borde, backgroundColor: e.hovered || e.focused ? t.superficieAlta : 'transparent', ...soloWeb({ transitionProperty: 'background-color', transitionDuration: '200ms' }) })}
              >
                {({ hovered }: PressState) => (
                  <>
                    <View style={{ width: 24, height: 24, borderRadius: radio.pildora, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? t.accent : 'transparent', borderWidth: done ? 0 : 2, borderColor: s.state === 'current' ? t.accentStrong : t.borde }}>
                      {done ? <Icono nombre="check" tamano="sm" color={t.onAccent} /> : null}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Texto variante="etiqueta" numberOfLines={1} style={done ? { textDecorationLine: 'line-through' } : undefined}>
                        {s.title}
                      </Texto>
                      <Texto variante="pequeno" suave numberOfLines={1}>
                        {s.detail}
                      </Texto>
                    </View>
                    <View style={soloWeb({ transitionProperty: 'transform', transitionDuration: '240ms', transform: hovered ? 'translateX(4px)' : 'translateX(0px)' })}>
                      <Icono nombre="chevron-right" tamano="sm" color={hovered ? t.texto : t.textoSuave} />
                    </View>
                  </>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Panel>
  );
}
