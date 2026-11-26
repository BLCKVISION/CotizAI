import { type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { Icon, type IconName, AppText } from './components';
import { useDevice } from './device';
import { Staggered, useCounter, glass } from './effects';
import { useTheme } from './theme';
import { maxContentWidth, spacing, radius } from './tokens';

/** Contenedor de página: gutters adaptativos, ancho máximo, scroll y entrada escalonada de sus bloques. */
export function Page({ children }: { children: ReactNode }) {
  const { device } = useDevice();
  const gutter = device === 'mobile' ? spacing.md : spacing.xl;
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ flexGrow: 1, alignItems: 'center', paddingBottom: spacing.xxxl }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ width: '100%', maxWidth: maxContentWidth, paddingHorizontal: gutter, paddingTop: spacing.xl, gap: spacing.xl }}>
        <Staggered>{children}</Staggered>
      </View>
    </ScrollView>
  );
}

/** Encabezado estilo Relay: migas «CotizAI / Sección», título display ligero y subtítulo suave. */
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  const { device } = useDevice();
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: device === 'mobile' ? 'column' : 'row',
        alignItems: device === 'mobile' ? 'stretch' : 'flex-end',
        justifyContent: 'space-between',
        gap: spacing.md,
      }}
    >
      <View style={{ gap: spacing.sm, flexShrink: 1 }}>
        {eyebrow ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <AppText variant="small" soft>
              CotizAI
            </AppText>
            <AppText variant="small" soft>
              /
            </AppText>
            <AppText variant="label">{eyebrow}</AppText>
          </View>
        ) : null}
        <AppText variant={device === 'mobile' ? 'subtitle' : 'title'} accessibilityRole="header" style={{ color: t.text }}>
          {title}
        </AppText>
        {description ? (
          <AppText soft style={{ maxWidth: 640 }}>
            {description}
          </AppText>
        ) : null}
      </View>
      {action}
    </View>
  );
}

/** Tarjeta de métrica: cifra display ligera que cuenta hasta su valor, etiqueta e icono en disco blanco. */
export function Metric({ label, value, icon }: { label: string; value: number; icon: IconName }) {
  const t = useTheme();
  const shown = useCounter(value);
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}`}
      style={{
        ...glass({ radius: radius.xl }),
        flexGrow: 1,
        flexBasis: 170,
        padding: spacing.lg,
        gap: spacing.sm,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText variant="label" soft>
          {label}
        </AppText>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: radius.pill,
            backgroundColor: '#FFFFFF',
            borderWidth: 1,
            borderColor: 'rgba(15,23,42,0.08)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name={icon} color={t.text} />
        </View>
      </View>
      <AppText variant="metric">{shown}</AppText>
    </View>
  );
}
