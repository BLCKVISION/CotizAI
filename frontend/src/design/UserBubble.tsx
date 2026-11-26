/** Avatar bubble that grows into a small account panel. */
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { openTour } from '@/features/onboarding/tourStore';

import { Texto } from './componentes';
import { Entrada, soloWeb } from './efectos';
import { LineIcon, type LineIconName } from './LineIcon';
import { useTema } from './tema';
import { espacio, radio } from './tokens';

const SIZE = 44;
const OPEN_WIDTH = 300;
const easing = 'cubic-bezier(0.16, 1, 0.3, 1)';
type PressState = { pressed: boolean; hovered?: boolean; focused?: boolean };

function MenuRow({ icon, label, onPress, color }: { icon: LineIconName; label: string; onPress: () => void; color?: string }) {
  const t = useTema();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={(e: PressState) => ({ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: espacio.sm + 4, paddingHorizontal: espacio.sm + 4, borderRadius: radio.md, borderWidth: 2, borderColor: e.focused ? t.foco : 'transparent', backgroundColor: e.hovered || e.pressed ? t.superficieAlta : 'transparent' })}
    >
      <LineIcon name={icon} color={color} />
      <Texto variante="etiqueta" color={color}>
        {label}
      </Texto>
    </Pressable>
  );
}

export function UserBubble({ name, role, onSignOut }: { name: string; role: string; onSignOut: () => void }) {
  const t = useTema();
  const [open, setOpen] = useState(false);
  const initials = name.slice(0, 2).toUpperCase();
  return (
    <View style={{ width: SIZE, height: SIZE, zIndex: 40 }}>
      {open ? <Pressable accessibilityLabel="Cerrar menú de usuario" onPress={() => setOpen(false)} style={[{ position: 'absolute', width: 1, height: 1 }, soloWeb({ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh' })]} /> : null}
      <View
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: open ? OPEN_WIDTH : SIZE,
          maxHeight: open ? 260 : SIZE,
          overflow: 'hidden',
          backgroundColor: '#FFFFFF',
          borderRadius: open ? radio.xl : SIZE / 2,
          shadowColor: '#0F172A',
          shadowOpacity: open ? 0.16 : 0.07,
          shadowRadius: open ? 28 : 10,
          shadowOffset: { width: 0, height: open ? 14 : 4 },
          ...soloWeb({ transitionProperty: 'width, max-height, border-radius, box-shadow', transitionDuration: '380ms', transitionTimingFunction: easing }),
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Cuenta de ${name}, ${role}`}
          accessibilityState={{ expanded: open }}
          aria-expanded={open}
          onPress={() => setOpen((v) => !v)}
          style={(e: PressState) => ({ height: SIZE + (open ? espacio.md : 0), flexDirection: 'row', alignItems: 'center', justifyContent: open ? 'flex-start' : 'center', gap: espacio.sm + 2, paddingHorizontal: open ? espacio.md : 0, borderRadius: SIZE / 2, borderWidth: 2, borderColor: e.focused ? t.foco : 'transparent' })}
        >
          <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: open ? t.accent : 'transparent' }}>
            <Texto variante="etiqueta" color={t.onAccent}>
              {initials}
            </Texto>
          </View>
          {open ? (
            <View style={{ flex: 1, minWidth: 0 }}>
              <Texto variante="etiqueta" numberOfLines={1}>
                {name}
              </Texto>
              <Texto variante="pequeno" suave>
                {role}
              </Texto>
            </View>
          ) : null}
        </Pressable>
        {open ? (
          <Entrada indice={1}>
            <View style={{ padding: espacio.sm, borderTopWidth: 1, borderTopColor: t.borde, gap: 2 }}>
              <MenuRow
                icon="play"
                label="Ver cómo se usa"
                onPress={() => {
                  setOpen(false);
                  openTour();
                }}
              />
              <MenuRow icon="log-out" label="Cerrar sesión" color={t.error.texto} onPress={onSignOut} />
            </View>
          </Entrada>
        ) : null}
      </View>
    </View>
  );
}
