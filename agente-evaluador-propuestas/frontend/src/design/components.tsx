import { Feather } from '@expo/vector-icons';
import { type ComponentProps, type ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  type PressableStateCallbackType,
  Text,
  TextInput,
  type TextInputProps,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';

import { webOnly, glass } from './effects';
import { useTheme } from './theme';
import { spacing, source, icon as iconSize, radius, touchSize, text } from './tokens';

type PressableState = PressableStateCallbackType & { hovered?: boolean; focused?: boolean };
export type IconName = ComponentProps<typeof Feather>['name'];

/* ───────────── Icono ───────────── */
/** Decorativo por defecto (oculto a lectores de pantalla); si porta significado propio, pasar `etiqueta`. */
export function Icon({
  name,
  size = 'md',
  color,
  label,
}: {
  name: IconName;
  size?: keyof typeof iconSize;
  color?: string;
  label?: string;
}) {
  const t = useTheme();
  return (
    <Feather
      name={name}
      size={iconSize[size]}
      color={color ?? t.text}
      accessibilityElementsHidden={!label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
      accessibilityLabel={label}
    />
  );
}

/* ───────────── Texto ───────────── */
type Variant = keyof typeof text;
export function AppText({
  variant = 'body',
  soft = false,
  color,
  style,
  ...props
}: ComponentProps<typeof Text> & { variant?: Variant; soft?: boolean; color?: string }) {
  const t = useTheme();
  const base: TextStyle = { ...text[variant], color: color ?? (soft ? t.softText : t.text) };
  return <Text {...props} style={[base, style]} />;
}

/* ───────────── Botón ───────────── */
export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading = false,
  disabled = false,
  fullWidth = false,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
}) {
  const t = useTheme();
  const inactive = loading || disabled;
  const textColor = variant === 'primary' ? t.onLime : t.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={(e: PressableState): ViewStyle => ({
        minHeight: touchSize,
        borderRadius: radius.pill,
        paddingHorizontal: spacing.lg,
        flexDirection: 'row',
        gap: spacing.sm,
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: fullWidth ? 'stretch' : 'flex-start',
        borderWidth: 2, // constante: el foco cambia solo el color y no desplaza el layout
        borderColor: e.focused ? t.focus : variant === 'secondary' ? 'rgba(15,23,42,0.14)' : variant === 'primary' ? 'rgba(0,0,0,0.12)' : 'transparent',
        backgroundColor:
          variant === 'primary'
            ? e.pressed
              ? t.limePressed
              : t.lime
            : variant === 'secondary'
              ? e.pressed || e.hovered
                ? '#FFFFFF'
                : 'rgba(255,255,255,0.75)'
              : e.pressed || e.hovered
                ? 'rgba(15,23,42,0.05)'
                : 'transparent',
        opacity: inactive ? 0.55 : 1,
        ...(variant === 'primary' && !inactive
          ? { shadowColor: t.lime, shadowOpacity: e.hovered ? 0.65 : 0.45, shadowRadius: e.hovered ? 16 : 10, shadowOffset: { width: 0, height: 2 } }
          : null),
        ...webOnly({
          transitionProperty: 'background-color, box-shadow, transform',
          transitionDuration: '220ms',
          transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
          ...(e.hovered && !inactive ? { transform: 'translateY(-1px)' } : null),
        }),
      })}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <>
          {icon ? <Icon name={icon} color={textColor} /> : null}
          <Text style={{ ...text.label, fontSize: 16, color: textColor }}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

/** Botón solo de icono: área táctil de 48 y nombre accesible obligatorio. */
export function IconButton({ name, label, onPress }: { name: IconName; label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={(e: PressableState): ViewStyle => ({
        width: touchSize,
        height: touchSize,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: e.focused ? t.focus : 'transparent',
        backgroundColor: e.pressed || e.hovered ? t.highSurface : 'transparent',
      })}
    >
      <Icon name={name} />
    </Pressable>
  );
}

/* ───────────── Campo de texto ───────────── */
type FieldProps = TextInputProps & { label: string; error?: string; help?: string; icon?: IconName };
export function TextField({ label, error, help, icon, secureTextEntry, multiline, ...props }: FieldProps) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  const isSecret = Boolean(secureTextEntry);
  const borderColor = error ? t.error.text : focused ? t.focus : t.controlBorder;

  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="label">{label}</AppText>
      <View
        style={{
          flexDirection: 'row',
          alignItems: multiline ? 'flex-start' : 'center',
          minHeight: touchSize,
          borderRadius: radius.nav,
          backgroundColor: 'rgba(255,255,255,0.92)',
          borderWidth: 2,
          borderColor: borderColor,
          paddingLeft: spacing.md,
          gap: spacing.sm,
        }}
      >
        {icon ? (
          <View style={{ paddingTop: multiline ? spacing.md : 0 }}>
            <Icon name={icon} color={t.softText} />
          </View>
        ) : null}
        <TextInput
          {...props}
          multiline={multiline}
          secureTextEntry={isSecret && !visible}
          accessibilityLabel={label}
          accessibilityHint={error ?? help}
          aria-invalid={Boolean(error)}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          placeholderTextColor={t.softText}
          style={[
            {
              ...text.body,
              flex: 1,
              color: t.text,
              paddingVertical: multiline ? spacing.md : spacing.sm,
              paddingRight: isSecret ? 0 : spacing.md,
              minHeight: multiline ? 112 : undefined,
              textAlignVertical: multiline ? 'top' : 'center',
              outlineWidth: 0,
            },
          ]}
        />
        {isSecret ? (
          <IconButton
            name={visible ? 'eye-off' : 'eye'}
            label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            onPress={() => setVisible((v) => !v)}
          />
        ) : null}
      </View>
      {error ? (
        <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'center' }} accessibilityLiveRegion="polite">
          <Icon name="alert-circle" size="sm" color={t.error.text} />
          <AppText variant="small" color={t.error.text} style={{ flex: 1 }}>
            {error}
          </AppText>
        </View>
      ) : help ? (
        <AppText variant="small" soft>
          {help}
        </AppText>
      ) : null}
    </View>
  );
}

/* ───────────── Tarjeta ───────────── */
export function Card({
  children,
  onPress,
  accessibleLabel,
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  accessibleLabel?: string;
  style?: ViewStyle;
}) {
  const t = useTheme();
  const base = (e?: PressableState): ViewStyle => ({
    ...glass({ radius: radius.xl, elevated: Boolean(e?.hovered) }),
    borderWidth: e?.focused ? 2 : 1,
    ...(e?.focused ? { borderColor: t.focus } : null),
    padding: spacing.lg,
    gap: spacing.sm,
    ...(e?.hovered ? webOnly({ transform: 'translateY(-2px)' }) : null), // hover: sube 2 px, como en Relay
    ...style,
  });
  if (!onPress) return <View style={base()}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibleLabel}
      onPress={onPress}
      style={(e: PressableState) => ({ ...base(e), opacity: e.pressed ? 0.85 : 1 })}
    >
      {children}
    </Pressable>
  );
}

/* ───────────── Insignia de estado (color + icono + texto: nunca solo color) ───────────── */
export type Tone = 'success' | 'warning' | 'info' | 'neutral' | 'error';
export function Badge({ label, tone, icon }: { label: string; tone: Tone; icon?: IconName }) {
  const t = useTheme();
  const { text: textColor, background } = t[tone];
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: spacing.xs,
        backgroundColor: background,
        borderRadius: radius.pill,
        paddingVertical: spacing.xs,
        paddingHorizontal: spacing.sm + 2,
      }}
    >
      {icon ? <Icon name={icon} size="sm" color={textColor} /> : null}
      <Text numberOfLines={1} style={{ ...text.label, fontSize: 13, color: textColor }}>
        {label}
      </Text>
    </View>
  );
}

/* ───────────── Chip de filtro ───────────── */
export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={(e: PressableState): ViewStyle => ({
        minHeight: 40,
        justifyContent: 'center',
        paddingHorizontal: spacing.md,
        borderRadius: radius.pill,
        borderWidth: 2,
        borderColor: e.focused ? t.focus : selected ? t.primary : 'rgba(15,23,42,0.10)',
        backgroundColor: selected ? t.primary : e.hovered ? '#FFFFFF' : 'rgba(255,255,255,0.7)',
        ...webOnly({ transitionProperty: 'background-color, border-color', transitionDuration: '200ms' }),
      })}
    >
      <Text style={{ ...text.label, color: selected ? t.onPrimary : t.text }}>{label}</Text>
    </Pressable>
  );
}

/* ───────────── Estado vacío ───────────── */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: IconName;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  const t = useTheme();
  return (
    <View
      style={{
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.xxl,
        paddingHorizontal: spacing.lg,
        borderRadius: radius.panel,
        borderWidth: 2,
        borderStyle: 'dashed',
        borderColor: 'rgba(15,23,42,0.14)',
        backgroundColor: 'rgba(255,255,255,0.6)',
      }}
    >
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: radius.pill,
          backgroundColor: t.lime,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon} size="xl" color={t.onLime} />
      </View>
      <AppText variant="subtitle" style={{ textAlign: 'center' }}>
        {title}
      </AppText>
      <AppText soft style={{ textAlign: 'center', maxWidth: 420 }}>
        {description}
      </AppText>
      {action ? <View style={{ flexDirection: 'row', justifyContent: 'center' }}>{action}</View> : null}
    </View>
  );
}

/* ───────────── Esqueleto de carga (estático: respeta reduce-motion por construcción) ───────────── */
export function Skeleton({ height = 16, width = '100%' }: { height?: number; width?: ViewStyle['width'] }) {
  const t = useTheme();
  return <View style={{ height: height, width: width, borderRadius: radius.sm, backgroundColor: t.highSurface }} />;
}

/* ───────────── Marca ───────────── */
export function Brand({ compact = false }: { onDark?: boolean; compact?: boolean }) {
  const t = useTheme();
  const side = compact ? 32 : 40;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="CotizAI"
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 }}
    >
      <View
        style={{
          width: side,
          height: side,
          borderRadius: radius.md,
          backgroundColor: t.primary,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Feather name="check-square" size={compact ? 18 : 22} color={t.lime} />
      </View>
      <Text style={{ fontFamily: source.display, fontSize: compact ? 24 : 28, letterSpacing: -0.9, color: t.text }}>
        Cotiz<Text style={{ fontFamily: source.extra }}>AI</Text>
      </Text>
    </View>
  );
}

/* ───────────── Avatar con iniciales ───────────── */
export function Avatar({ text: value }: { text: string }) {
  const t = useTheme();
  return (
    <View
      style={{
        width: 40,
        height: 40,
        borderRadius: radius.pill,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: 'rgba(15,23,42,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
      }}
    >
      <Text style={{ ...text.label, color: t.text }}>{value.slice(0, 2).toUpperCase()}</Text>
    </View>
  );
}
