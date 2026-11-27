/** A supplier shown as a company card: icon and name at rest; on hover or focus it turns sky-aqua and shows contact data. */
import { Animated, Pressable, View } from 'react-native';

import { Sheen, useAttention, wiggle } from '@/design/Attention';
import { Icono, Texto } from '@/design/componentes';
import { soloWeb } from '@/design/efectos';
import { useTema } from '@/design/tema';
import { espacio, radio } from '@/design/tokens';
import type { Proveedor } from '@/features/gestion/api';

export const PROVIDER_CARD_HEIGHT = 224;
const easing = 'cubic-bezier(0.16, 1, 0.3, 1)';
const motion = (properties: string) => ({ transitionProperty: properties, transitionDuration: '420ms', transitionTimingFunction: easing });

type PressState = { pressed: boolean; hovered?: boolean; focused?: boolean };

export function ProviderCard({ provider, onPress, index = 0 }: { provider: Proveedor; onPress: () => void; index?: number }) {
  const t = useTema();
  const pulse = useAttention(index);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${provider.nombre}. RIF ${provider.rif}. ${provider.ubicacion}`}
      onPress={onPress}
      style={(e: PressState) => {
        const active = Boolean(e.hovered || e.focused);
        return {
          height: PROVIDER_CARD_HEIGHT,
          borderRadius: 30,
          borderWidth: 2,
          borderColor: e.focused ? t.foco : 'rgba(255,255,255,0.85)',
          backgroundColor: active ? '#A6E6F4' : 'rgba(255,255,255,0.9)',
          overflow: 'hidden',
          padding: espacio.md + 4,
          justifyContent: 'space-between',
          ...soloWeb({
            ...motion('transform, box-shadow, background-color'),
            backgroundImage: active ? 'linear-gradient(165deg, #B9E6FF 0%, #99E6F2 55%, #A8F3DD 100%)' : 'linear-gradient(180deg, #FFFFFF 0%, #F1F3F7 100%)',
            boxShadow: active ? '0 26px 44px -22px rgba(14,143,168,0.55)' : '0 14px 30px -24px rgba(15,23,42,0.35), inset 0 0 22px rgba(255,255,255,0.65)',
            ...(active ? { transform: 'translateY(-6px)' } : null),
          }),
        };
      }}
    >
      {({ hovered, focused }: PressState) => {
        const active = Boolean(hovered || focused);
        return (
          <>
            <Animated.View style={[{ alignSelf: 'flex-start' }, wiggle(pulse)]}>
              <View style={{ width: 56, height: 56, borderRadius: radio.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? '#FFFFFF' : t.accent, ...soloWeb({ ...motion('transform, background-color'), transform: active ? 'scale(1.1) rotate(-6deg)' : 'scale(1) rotate(0deg)' }) }}>
                <Icono nombre="briefcase" tamano="lg" color={t.onAccent} />
              </View>
            </Animated.View>
            {/* Contact data slides in on hover; touch users open the card to read it. */}
            <View style={soloWeb({ ...motion('opacity, transform'), opacity: active ? 1 : 0, transform: active ? 'translateY(0px)' : 'translateY(8px)' })}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icono nombre="phone" tamano="sm" color={t.onAccent} />
                <Texto variante="pequeno" color={t.onAccent} numberOfLines={1} style={{ flex: 1 }}>
                  {provider.contacto}
                </Texto>
              </View>
            </View>
            <View style={{ gap: 2 }}>
              <Texto variante="cuerpoMedio" color={t.onAccent} numberOfLines={2} style={{ fontFamily: 'Urbanist_600SemiBold', fontSize: 16, lineHeight: 20 }}>
                {provider.nombre}
              </Texto>
              <Texto variante="pequeno" color={active ? t.onAccent : t.textoSuave} numberOfLines={1}>
                {provider.rif} · {provider.ubicacion}
              </Texto>
            </View>
            <Sheen pulse={pulse} />
          </>
        );
      }}
    </Pressable>
  );
}
