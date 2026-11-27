/** Draws the floating notices as animated pills at the top centre. Tapping one dismisses it. */
import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';

import { Icono, type NombreIcono, Texto } from './componentes';
import { soloWeb, useReducirMovimiento } from './efectos';
import { dismissToast, subscribeToasts, type Toast, type ToastTone } from './toastStore';
import { TopLayer } from './TopLayer';
import { espacio, radio } from './tokens';

const LOOK: Record<ToastTone, { icon: NombreIcono; badge: string; mark: string }> = {
  error: { icon: 'alert-triangle', badge: '#FEE2E2', mark: '#B91C1C' },
  success: { icon: 'check', badge: '#CFFAE8', mark: '#166534' },
  info: { icon: 'info', badge: '#DBEAFE', mark: '#1E40AF' },
};

function Pill({ toast }: { toast: Toast }) {
  const reduce = useReducirMovimiento();
  const [enter] = useState(() => new Animated.Value(0));
  const [shake] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduce) {
      enter.setValue(1);
      return;
    }
    Animated.spring(enter, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }).start();
    // An error also shakes once so it is noticed.
    if (toast.tone === 'error') Animated.timing(shake, { toValue: 1, duration: 520, delay: 280, easing: Easing.linear, useNativeDriver: true }).start();
  }, [enter, shake, reduce, toast.tone]);
  const look = LOOK[toast.tone];
  return (
    <Animated.View
      style={{
        opacity: enter.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }),
        transform: [
          { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [-36, 0] }) },
          { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) },
          { translateX: shake.interpolate({ inputRange: [0, 0.2, 0.4, 0.6, 0.8, 1], outputRange: [0, -10, 9, -6, 4, 0] }) },
        ],
      }}
    >
      <Pressable
        accessibilityRole="alert"
        accessibilityLabel={`${toast.title.replace(/\.$/, '')}${toast.detail ? `. ${toast.detail}` : ''}. Tocar para cerrar`}
        onPress={() => dismissToast(toast.id)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.sm + 4, maxWidth: 560, paddingLeft: 8, paddingRight: espacio.lg, paddingVertical: 8, borderRadius: radio.pildora, backgroundColor: '#0F172A', shadowColor: '#0F172A', shadowOpacity: 0.28, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, ...soloWeb({ boxShadow: '0 18px 40px -16px rgba(15,23,42,0.55)' }) }}
      >
        <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: look.badge }}>
          <Icono nombre={look.icon} tamano="sm" color={look.mark} />
        </View>
        <View style={{ flexShrink: 1 }}>
          <Texto variante="etiqueta" color="#FFFFFF" numberOfLines={2}>
            {toast.title.replace(/\.$/, '')}
          </Texto>
          {toast.detail ? (
            <Texto variante="pequeno" color="#CBD5E1" numberOfLines={1}>
              {toast.detail}
            </Texto>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => subscribeToasts(setToasts), []);
  if (toasts.length === 0) return null;
  return (
    <TopLayer>
      <View pointerEvents="box-none" accessibilityLiveRegion="polite" style={{ position: 'absolute', top: 14, left: espacio.md, right: espacio.md, zIndex: 90, alignItems: 'center', gap: espacio.sm }}>
        {toasts.map((toast) => (
          <Pill key={toast.id} toast={toast} />
        ))}
      </View>
    </TopLayer>
  );
}
