/** A supplier shown as a company card: icon and name at rest; on hover or focus it turns sky-aqua and shows contact data. */
import { Animated, Pressable, View } from 'react-native';

import { Sheen, useAttention, wiggle } from '@/design/Attention';
import { Icono, Insignia, Texto } from '@/design/componentes';
import { soloWeb } from '@/design/efectos';
import { isKeyboardFocus } from '@/design/focusModality';
import { swatch, tint, useTema } from '@/design/tema';
import { espacio, radio } from '@/design/tokens';
import { backgroundLabel, type SupplierEntry } from '@/core/suppliers';

export const PROVIDER_CARD_HEIGHT = 224;
const easing = 'cubic-bezier(0.16, 1, 0.3, 1)';
const motion = (properties: string) => ({ transitionProperty: properties, transitionDuration: '420ms', transitionTimingFunction: easing });

type PressState = { pressed: boolean; hovered?: boolean; focused?: boolean };

export function ProviderCard({ provider, onPress, index = 0 }: { provider: SupplierEntry; onPress: () => void; index?: number }) {
  const t = useTema();
  const record = provider.registration;
  const background = backgroundLabel(provider);
  const identity = record ? `${record.tax_id} · ${record.location}` : 'Sin ficha todavía';
  const pulse = useAttention(index);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${provider.name}. ${identity}. ${background.text}`}
      onPress={onPress}
      style={(e: PressState) => {
        const active = Boolean(e.hovered) || isKeyboardFocus(e.focused);
        return {
          height: PROVIDER_CARD_HEIGHT,
          borderRadius: 30,
          borderWidth: 2,
          borderColor: isKeyboardFocus(e.focused) ? t.foco : tint.white(0.85),
          backgroundColor: active ? swatch.aqua250 : tint.white(0.9),
          overflow: 'hidden',
          padding: espacio.md + 4,
          justifyContent: 'space-between',
          ...soloWeb({
            ...motion('transform, box-shadow, background-color'),
            backgroundImage: active ? `linear-gradient(165deg, ${swatch.sky200} 0%, ${swatch.aqua200} 55%, ${swatch.mint200} 100%)` : `linear-gradient(180deg, ${swatch.white} 0%, ${swatch.gray75} 100%)`,
            boxShadow: active ? `0 26px 44px -22px ${tint.teal(0.55)}` : `0 14px 30px -24px ${tint.navy(0.35)}, inset 0 0 22px ${tint.white(0.65)}`,
            ...(active ? { transform: 'translateY(-6px)' } : null),
          }),
        };
      }}
    >
      {({ hovered, focused }: PressState) => {
        const active = Boolean(hovered) || isKeyboardFocus(focused);
        return (
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: espacio.sm }}>
            <Animated.View style={[{ alignSelf: 'flex-start' }, wiggle(pulse)]}>
              <View style={{ width: 56, height: 56, borderRadius: radio.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? swatch.white : t.accent, ...soloWeb({ ...motion('transform, background-color'), transform: active ? 'scale(1.1) rotate(-6deg)' : 'scale(1) rotate(0deg)' }) }}>
                <Icono nombre="briefcase" tamano="lg" color={t.onAccent} />
              </View>
            </Animated.View>
              <View style={{ flexShrink: 1 }}>
                <Insignia etiqueta={background.text} tono={background.tone} />
              </View>
            </View>
            {/* Contact data slides in on hover; touch users open the card to read it. */}
            <View style={soloWeb({ ...motion('opacity, transform'), opacity: active ? 1 : 0, transform: active ? 'translateY(0px)' : 'translateY(8px)' })}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icono nombre="phone" tamano="sm" color={t.onAccent} />
                <Texto variante="pequeno" color={t.onAccent} numberOfLines={1} style={{ flex: 1 }}>
                  {record?.contact ?? 'Complete la ficha para ver el contacto'}
                </Texto>
              </View>
            </View>
            <View style={{ gap: 2 }}>
              <Texto variante="cuerpoMedio" color={t.onAccent} numberOfLines={2} style={{ fontFamily: 'Urbanist_600SemiBold', fontSize: 16, lineHeight: 20 }}>
                {provider.name}
              </Texto>
              <Texto variante="pequeno" color={active ? t.onAccent : t.textoSuave} numberOfLines={1}>
                {identity}
              </Texto>
            </View>
            <Sheen pulse={pulse} />
          </>
        );
      }}
    </Pressable>
  );
}
