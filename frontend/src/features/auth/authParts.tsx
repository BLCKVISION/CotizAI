/** Shared pieces of the sign-in, sign-up and password recovery forms. */
import { type ReactNode, useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, type TextInputProps, View } from 'react-native';

import { ErrorApi } from '@/core/api/cliente';
import { Icono, Texto } from '@/design/componentes';
import { accentGradient, soloWeb } from '@/design/efectos';
import { FieldHint, useHover } from '@/design/FieldHint';
import { RollingLabel } from '@/design/RollingLabel';
import { espacio, radio, texto } from '@/design/tokens';
import { swatch, tint } from '@/design/tema';

export const authColor = {
  backdrop: swatch.gray100,
  panel: swatch.white,
  text: swatch.night,
  soft: swatch.slate550,
  underline: swatch.slate400,
  focus: swatch.sky700,
  error: swatch.red700,
  onAccent: swatch.deepNavy,
} as const;

export type AuthMode = 'login' | 'register' | 'forgot';
export type Notice = { tone: 'error' | 'info' | 'success'; text: string } | null;
type PressState = { pressed: boolean; hovered?: boolean; focused?: boolean };

/** A missing route means the server has not enabled the feature yet. */
export const accountErrorNotice = (e: unknown): Notice => {
  if (e instanceof ErrorApi && (e.estado === 404 || e.estado === 405)) {
    return { tone: 'info', text: 'Esta función estará disponible cuando se active en el servidor.' };
  }
  return { tone: 'error', text: e instanceof ErrorApi ? e.message : 'Error inesperado.' };
};

export function LineField({ label, error, secret = false, hint, ...props }: TextInputProps & { label: string; error?: string; secret?: boolean; hint?: ReactNode }) {
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  const { hovered, hoverProps } = useHover();
  const showHint = Boolean(hint) && (hovered || focused);
  return (
    <View {...hoverProps} style={{ width: '100%', gap: 2, zIndex: showHint ? 20 : 0 }}>
      <Texto variante="etiqueta" color={authColor.text}>
        {label}
      </Texto>
      <View style={{ flexDirection: 'row', alignItems: 'center', borderBottomWidth: focused ? 2 : 1, paddingBottom: focused ? 0 : 1, borderBottomColor: error ? authColor.error : focused ? authColor.focus : authColor.underline }}>
        <TextInput
          {...props}
          accessibilityLabel={label}
          accessibilityHint={error}
          aria-invalid={Boolean(error)}
          secureTextEntry={secret && !visible}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[{ ...texto.cuerpo, fontSize: 16, flex: 1, minWidth: 0, minHeight: 42, color: authColor.text }, soloWeb({ outlineStyle: 'none', backgroundColor: 'transparent' })]}
        />
        {secret ? (
          <Pressable accessibilityRole="button" accessibilityLabel={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'} onPress={() => setVisible((v) => !v)} style={{ width: 44, height: 42, alignItems: 'center', justifyContent: 'center' }}>
            <Icono nombre={visible ? 'eye-off' : 'eye'} tamano="sm" color={authColor.soft} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Texto variante="pequeno" color={authColor.error} accessibilityLiveRegion="polite">
          {error}
        </Texto>
      ) : null}
      {hint ? <FieldHint visible={showHint}>{hint}</FieldHint> : null}
    </View>
  );
}

export function TextLink({ label, onPress, strong = false }: { label: string; onPress: () => void; strong?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={(e: PressState) => ({ minHeight: 44, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: e.focused ? authColor.focus : 'transparent' })}
    >
      {({ hovered }: PressState) => (
        <Texto variante={strong ? 'etiqueta' : 'pequeno'} color={strong || hovered ? authColor.focus : authColor.soft} style={hovered ? { textDecorationLine: 'underline' } : undefined}>
          {label}
        </Texto>
      )}
    </Pressable>
  );
}

export function SubmitButton({ label, busy, onPress }: { label: string; busy: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: busy, busy }}
      disabled={busy}
      onPress={onPress}
      style={(e: PressState) => ({
        alignSelf: 'stretch',
        height: 48,
        flexDirection: 'row',
        gap: espacio.sm,
        borderRadius: radio.pildora,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: e.focused ? authColor.focus : 'transparent',
        ...accentGradient(100),
        ...soloWeb({ transitionProperty: 'transform, box-shadow', transitionDuration: '260ms', transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)', ...(e.hovered ? { transform: 'translateY(-2px)', boxShadow: `0 14px 28px -16px ${tint.teal(0.65)}` } : null) }),
      })}
    >
      {({ hovered }: PressState) =>
        busy ? (
          <ActivityIndicator color={authColor.onAccent} />
        ) : (
          <>
            <RollingLabel text={label} active={Boolean(hovered)} style={{ ...texto.etiqueta, fontSize: 14, color: authColor.onAccent }} />
            <Icono nombre="arrow-right" tamano="sm" color={authColor.onAccent} />
          </>
        )
      }
    </Pressable>
  );
}

export function NoticeBox({ notice }: { notice: Notice }) {
  if (!notice) return null;
  const tone = notice.tone === 'error' ? { text: authColor.error, background: swatch.red100, icon: 'alert-triangle' as const } : notice.tone === 'success' ? { text: swatch.green800, background: swatch.green100, icon: 'check-circle' as const } : { text: swatch.blue800, background: swatch.blue100, icon: 'info' as const };
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ flexDirection: 'row', gap: espacio.sm, alignItems: 'center', padding: espacio.sm + 4, borderRadius: radio.nav, backgroundColor: tone.background }}>
      <Icono nombre={tone.icon} tamano="sm" color={tone.text} />
      <Texto variante="pequeno" color={tone.text} style={{ flex: 1 }}>
        {notice.text}
      </Texto>
    </View>
  );
}

export function FormHeading({ title, detail }: { title: string; detail: string }) {
  return (
    <View style={{ gap: espacio.xs, alignItems: 'flex-start' }}>
      <Texto accessibilityRole="header" color={authColor.text} style={{ fontFamily: 'Urbanist_400Regular', fontSize: 36, lineHeight: 42, letterSpacing: -1.2 }}>
        {title}
      </Texto>
      <Texto color={authColor.soft}>{detail}</Texto>
    </View>
  );
}
