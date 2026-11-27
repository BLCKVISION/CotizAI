/** Card that starts folded and always shows its title, so long pages fit without cut-off content. */
import { type ReactNode, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icono, Texto } from './componentes';
import { Entrada, soloWeb, vidrio } from './efectos';
import { tint, useTema } from './tema';
import { espacio, radio } from './tokens';

type PressState = { pressed: boolean; hovered?: boolean; focused?: boolean };

export function CollapsibleCard({ title, detail, defaultOpen = false, children }: { title: string; detail?: string; defaultOpen?: boolean; children: ReactNode }) {
  const t = useTema();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={{ ...vidrio({ radio: radio.xl }), overflow: 'hidden' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={detail ? `${title}. ${detail}` : title}
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        onPress={() => setOpen((v) => !v)}
        style={(e: PressState) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: espacio.md,
          paddingHorizontal: espacio.lg,
          paddingVertical: espacio.md,
          minHeight: 68,
          borderRadius: radio.xl,
          borderWidth: 2,
          borderColor: e.focused ? t.foco : 'transparent',
          backgroundColor: e.hovered ? tint.white(0.7) : 'transparent',
        })}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Texto variante="cuerpoMedio" accessibilityRole="header" numberOfLines={1} style={{ fontFamily: 'Urbanist_600SemiBold' }}>
            {title}
          </Texto>
          {detail ? (
            <Texto variante="pequeno" suave numberOfLines={1}>
              {detail}
            </Texto>
          ) : null}
        </View>
        <View style={{ width: 36, height: 36, borderRadius: radio.pildora, backgroundColor: tint.navy(0.05), alignItems: 'center', justifyContent: 'center', ...soloWeb({ transitionProperty: 'transform', transitionDuration: '300ms', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }) }}>
          <Icono nombre="chevron-down" tamano="sm" />
        </View>
      </Pressable>
      {open ? (
        <Entrada>
          <View style={{ paddingHorizontal: espacio.lg, paddingBottom: espacio.lg, gap: espacio.sm }}>{children}</View>
        </Entrada>
      ) : null}
    </View>
  );
}
