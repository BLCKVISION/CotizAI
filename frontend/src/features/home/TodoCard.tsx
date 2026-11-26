import { Pressable, ScrollView, View } from 'react-native';

import { Icono, Texto } from '@/design/componentes';
import { innerSurface, Panel, RoundButton } from '@/design/Panel';
import { useTema } from '@/design/tema';
import { espacio, radio } from '@/design/tokens';

import type { Journey } from './journey';

/** Checklist of the journey. Items complete themselves from real data; they are not manually ticked. */
export function TodoCard({ journey, onNavigate }: { journey: Journey; onNavigate: (path: string) => void }) {
  const t = useTema();
  const today = new Date().toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' });
  const open = () => onNavigate(journey.cta?.path ?? '/proyectos');
  return (
    <Panel title="Lista de tareas" subtitle={today.charAt(0).toUpperCase() + today.slice(1)} actions={<RoundButton icon="arrow-up-right" label="Ir al siguiente paso" onPress={open} />}>
      <View style={innerSurface}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: espacio.md, paddingVertical: 2 }}>
          {journey.steps.map((s, i) => {
            const done = s.state === 'done';
            return (
              <Pressable
                key={s.title}
                accessibilityRole="button"
                accessibilityLabel={`${s.title}, ${done ? 'completada' : 'pendiente'}`}
                onPress={open}
                style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.sm, flexGrow: 1, minHeight: 42, borderBottomWidth: i === journey.steps.length - 1 ? 0 : 1, borderBottomColor: t.borde }}
              >
                <View style={{ flex: 1 }}>
                  <Texto variante="etiqueta" numberOfLines={1} style={done ? { textDecorationLine: 'line-through' } : undefined}>
                    {s.title}
                  </Texto>
                  <Texto variante="pequeno" suave numberOfLines={1}>
                    {s.detail}
                  </Texto>
                </View>
                <View style={{ width: 24, height: 24, borderRadius: radio.pildora, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? t.accent : 'transparent', borderWidth: done ? 0 : 2, borderColor: s.state === 'current' ? t.accentStrong : t.borde }}>
                  {done ? <Icono nombre="check" tamano="sm" color={t.onAccent} /> : s.state === 'blocked' ? <Icono nombre="lock" tamano="sm" color={t.textoSuave} /> : null}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Panel>
  );
}
