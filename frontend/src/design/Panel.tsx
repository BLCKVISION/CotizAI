/** Dashboard card: translucent grey shell, title row with round buttons and an optional white inner surface. */
import { type ReactNode } from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';

import { Icono, type NombreIcono, Texto } from './componentes';
import { soloWeb } from './efectos';
import { isLineIcon, LineIcon } from './LineIcon';
import { swatch, tint, useTema } from './tema';
import { espacio, radio } from './tokens';

type ButtonState = { pressed: boolean; hovered?: boolean; focused?: boolean };

export function RoundButton({ icon, label, onPress, dark = false }: { icon: NombreIcono; label: string; onPress: () => void; dark?: boolean }) {
  const t = useTema();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      {...({ title: label } as object)}
      style={(e: ButtonState) => ({
        width: 44,
        height: 44,
        borderRadius: radio.pildora,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: e.focused ? t.foco : 'transparent',
        backgroundColor: dark ? t.primario : e.hovered || e.pressed ? swatch.white : tint.white(0.65),
        ...soloWeb({ transitionProperty: 'background-color', transitionDuration: '200ms' }),
      })}
    >
      {isLineIcon(icon) ? <LineIcon name={icon} color={dark ? swatch.white : t.texto} /> : <Icono nombre={icon} color={dark ? swatch.white : t.texto} />}
    </Pressable>
  );
}

const shell: ViewStyle = {
  flex: 1,
  backgroundColor: tint.white(0.46),
  borderRadius: radio.panel,
  borderWidth: 1,
  borderColor: tint.white(0.7),
  padding: 14,
  gap: 12,
  overflow: 'hidden',
  ...soloWeb({ backdropFilter: 'blur(28px)', WebkitBackdropFilter: 'blur(28px)' }),
};

export const innerSurface: ViewStyle = { flex: 1, minHeight: 0, backgroundColor: tint.white(0.94), borderRadius: radio.xl, overflow: 'hidden' };

export function Panel({ title, subtitle, actions, children, header }: { title?: string; subtitle?: string; actions?: ReactNode; children: ReactNode; header?: ReactNode }) {
  return (
    <View style={shell}>
      {header ?? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: espacio.sm + 2, paddingTop: 2 }}>
          <View style={{ flexShrink: 1 }}>
            <Texto variante="cuerpoMedio" accessibilityRole="header" style={{ fontFamily: 'Urbanist_600SemiBold' }}>
              {title}
            </Texto>
            {subtitle ? (
              <Texto variante="pequeno" suave numberOfLines={1}>
                {subtitle}
              </Texto>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', gap: espacio.sm }}>{actions}</View>
        </View>
      )}
      {children}
    </View>
  );
}
