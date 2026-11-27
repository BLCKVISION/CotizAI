/** Project shown as a folder: papers peek from behind a tabbed front; on hover/focus it turns sky-aqua. */
import { Animated, Platform, Pressable, View, type ViewStyle } from 'react-native';

import { Sheen, useAttention, wiggle } from '@/design/Attention';
import { Texto } from '@/design/componentes';
import { soloWeb } from '@/design/efectos';
import { isKeyboardFocus } from '@/design/focusModality';
import { useTema } from '@/design/tema';
import { espacio } from '@/design/tokens';

export const FOLDER_HEIGHT = 224;
const RADIUS = 30;
const easing = 'cubic-bezier(0.16, 1, 0.3, 1)';

/** Tabbed silhouette: raised tab on the left, soft slope down to the right. Native shows a rounded rectangle. */
const TAB_SHAPE =
  'polygon(0px 16px, 1% 9px, 3% 3px, 7% 0px, 40% 0px, 44% 2px, 47% 7px, 52% 20px, 55% 25px, 59% 27px, 93% 27px, 97% 29px, 99% 34px, 100% 42px, 100% 100%, 0px 100%)';

type PressState = { pressed: boolean; hovered?: boolean; focused?: boolean };
type Props = { title: string; count: string; footer: string; preview: string; onPress: () => void; compact?: boolean; roomy?: boolean; index?: number };

/** Vertical measures for the regular folder and the small one used inside dashboard cards (it fills its cell). */
const SIZES = {
  regular: { height: FOLDER_HEIGHT, paperTop: 26, front: 70, frontTop: 36, side: 22, bottom: 16, radius: RADIUS },
  compact: { height: undefined, paperTop: 10, front: 28, frontTop: 30, side: 14, bottom: 10, radius: 22 },
} as const;

const motion = (properties: string) => ({ transitionProperty: properties, transitionDuration: '420ms', transitionTimingFunction: easing });

export function FolderCard({ title, count, footer, preview, onPress, compact = false, roomy = false, index = 0 }: Props) {
  const t = useTema();
  const pulse = useAttention(index);
  const m = compact ? SIZES.compact : SIZES.regular;
  const dense = compact && !roomy; // one title line and the state beside the count
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${title}. ${count}. ${footer}`}
      onPress={onPress}
      style={(e: PressState): ViewStyle => {
        const active = Boolean(e.hovered) || isKeyboardFocus(e.focused);
        return {
          height: m.height,
          flex: compact ? 1 : undefined,
          minHeight: compact ? 118 : undefined,
          borderRadius: m.radius,
          borderWidth: 2,
          borderColor: isKeyboardFocus(e.focused) ? t.foco : 'rgba(255,255,255,0.85)',
          backgroundColor: active ? '#8FD6FA' : '#E1E5EC',
          overflow: 'hidden',
          opacity: e.pressed ? 0.9 : 1,
          ...soloWeb({
            ...motion('transform, box-shadow, background-color'),
            boxShadow: active ? '0 26px 44px -22px rgba(14,143,168,0.55)' : '0 14px 30px -24px rgba(15,23,42,0.35), inset 0 0 22px rgba(255,255,255,0.65)',
            ...(active ? { transform: 'translateY(-6px)' } : null),
          }),
        };
      }}
    >
      {({ hovered, focused }: PressState) => {
        const active = Boolean(hovered) || isKeyboardFocus(focused);
        return (
          <>
            {/* Papers peek out and rock while the periodic light passes. */}
            <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }, wiggle(pulse)]}>
            <View style={{ position: 'absolute', top: m.paperTop, left: m.side + 12, right: m.side + 12, height: 110, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.55)', ...soloWeb({ ...motion('transform'), transform: active ? 'translateY(-12px) rotate(-4deg)' : 'rotate(0deg)' }) }} />
            <View style={{ position: 'absolute', top: m.paperTop + 6, left: m.side - 2, right: m.side - 2, height: 120, borderRadius: 14, backgroundColor: active ? '#FFFFFF' : 'rgba(255,255,255,0.85)', paddingHorizontal: espacio.md, paddingTop: 10, ...soloWeb({ ...motion('transform'), transform: active ? 'translateY(-10px) rotate(2deg)' : 'rotate(0deg)' }) }}>
              <View style={{ opacity: active ? 1 : 0, ...soloWeb(motion('opacity')) }}>
                <Texto variante="pequeno" suave numberOfLines={3} style={{ fontSize: 11, lineHeight: 15 }}>
                  {preview}
                </Texto>
              </View>
            </View>
            </Animated.View>
            {/* Folder front. The shadow lives on the wrapper so it follows the clipped tab outline. */}
            <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, ...soloWeb({ filter: 'drop-shadow(0 -3px 9px rgba(15,23,42,0.10))' }) }}>
            <View
              style={{
                position: 'absolute',
                top: m.front,
                left: 0,
                right: 0,
                bottom: 0,
                paddingHorizontal: m.side,
                paddingTop: m.frontTop,
                paddingBottom: m.bottom,
                justifyContent: 'space-between',
                backgroundColor: active ? '#A6E6F4' : '#F8F9FB',
                borderRadius: Platform.OS === 'web' ? 0 : m.radius,
                ...soloWeb({
                  clipPath: TAB_SHAPE,
                  backgroundImage: active ? 'linear-gradient(165deg, #B9E6FF 0%, #99E6F2 55%, #A8F3DD 100%)' : 'linear-gradient(180deg, #FFFFFF 0%, #F1F3F7 100%)',
                  ...motion('background-color'),
                }),
              }}
            >
              <View style={{ gap: 2 }}>
                <Texto variante="cuerpoMedio" color={t.onAccent} numberOfLines={dense ? 1 : 2} style={{ fontFamily: 'Urbanist_600SemiBold', fontSize: compact ? 14 : 16, lineHeight: compact ? 18 : 20 }}>
                  {title}
                </Texto>
                <Texto variante="pequeno" color={t.onAccent} numberOfLines={1}>
                  {dense ? `${count} · ${footer}` : count}
                </Texto>
              </View>
              {dense ? null : (
                <Texto variante="pequeno" color={active ? t.onAccent : t.textoSuave} numberOfLines={1}>
                  {footer}
                </Texto>
              )}
            </View>
            </View>
            <Sheen pulse={pulse} />
          </>
        );
      }}
    </Pressable>
  );
}
