import { usePathname, useRouter } from 'expo-router';
import { type ReactNode } from 'react';
import { Pressable, type PressableStateCallbackType, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSession } from '@/core/session/SessionProvider';

import { Avatar, IconButton, Icon, Badge, Brand, type IconName, AppText } from './components';
import { useDevice } from './device';
import { webOnly, glass } from './effects';
import { useTheme } from './theme';
import { spacing, floatMargin, radius, touchSize } from './tokens';

const ROLE_LABEL = { loader: 'Cargador', evaluator: 'Evaluador', approver: 'Aprobador', auditor: 'Auditor' } as const;

const NAVIGATION: { route: '/projects'; label: string; icon: IconName }[] = [
  { route: '/projects', label: 'Proyectos', icon: 'folder' },
];

/** Ítem de la barra lateral: píldora radio 15; activo = blanco puro elevado, texto negro y punto lima (Relay claro). */
function NavigationItem({ label, icon, active, danger = false, onPress }: { label: string; icon: IconName; active: boolean; danger?: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={(e: { pressed: boolean; hovered?: boolean; focused?: boolean }) => ({
        minHeight: touchSize,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm + 2,
        paddingHorizontal: spacing.md,
        borderRadius: radius.nav,
        borderWidth: 2,
        borderColor: e.focused ? t.focus : active ? 'rgba(15,23,42,0.08)' : 'transparent',
        backgroundColor: active ? '#FFFFFF' : e.hovered || e.pressed ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.40)',
        ...(active
          ? { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 3 }
          : null),
        ...webOnly({
          transitionProperty: 'transform, box-shadow, background-color',
          transitionDuration: '220ms',
          transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
          ...(active ? { transform: 'translateY(-1px)', boxShadow: '0 8px 24px -2px rgba(0,0,0,.08), 0 2px 6px rgba(0,0,0,.04)' } : null),
        }),
      })}
    >
      {({ hovered }: PressableStateCallbackType & { hovered?: boolean }) => (
        <>
          <Icon name={icon} color={danger && hovered ? t.error.text : active || hovered ? t.text : t.softText} />
          <AppText
            variant={active ? 'label' : 'bodyMedium'}
            color={danger && hovered ? t.error.text : active || hovered ? t.text : t.softText}
            style={{ flex: 1, fontSize: 15 }}
          >
            {label}
          </AppText>
          {active ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.lime, borderWidth: 1, borderColor: 'rgba(0,0,0,0.25)' }} /> : null}
        </>
      )}
    </Pressable>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const route = usePathname();
  const { device } = useDevice();
  const { user, closeSession } = useSession();
  const isDesktop = device === 'desktop';
  const initials = (user?.email ?? '??').slice(0, 2);

  if (isDesktop) {
    return (
      <View style={{ flex: 1, flexDirection: 'row', padding: floatMargin, gap: floatMargin + 6 }}>
        {/* Sidebar flotante: radio 28, blanco .82 con blur 32 */}
        <View
          style={{
            ...glass({ opacity: 0.82, blur: 32, radius: radius.panel }),
            width: 264,
            padding: spacing.md,
            paddingTop: spacing.lg,
            justifyContent: 'space-between',
          }}
        >
          <View style={{ gap: spacing.lg }}>
            <View style={{ paddingHorizontal: spacing.sm }}>
              <Brand />
            </View>
            <View style={{ height: 1, backgroundColor: 'rgba(15,23,42,0.06)' }} />
            <View accessibilityRole="menu" style={{ gap: spacing.xs + 2 }}>
              {NAVIGATION.map((n) => (
                <NavigationItem
                  key={n.route}
                  label={n.label}
                  icon={n.icon}
                  active={route.startsWith(n.route)}
                  onPress={() => router.push(n.route)}
                />
              ))}
            </View>
          </View>
          <View style={{ gap: spacing.md }}>
            <View style={{ height: 1, backgroundColor: 'rgba(15,23,42,0.06)' }} />
            <View style={{ flexDirection: 'row', gap: spacing.sm + 2, alignItems: 'center', paddingHorizontal: spacing.sm }}>
              <Avatar text={initials} />
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="small" numberOfLines={1}>
                  {user?.email}
                </AppText>
                <AppText variant="small" soft>
                  {user ? ROLE_LABEL[user.role] : ''}
                </AppText>
              </View>
            </View>
            <NavigationItem label="Cerrar sesión" icon="log-out" active={false} danger onPress={closeSession} />
          </View>
        </View>
        <View style={{ flex: 1 }}>{children}</View>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View
        style={{
          ...glass({ opacity: 0.82, blur: 32, radius: radius.xl }),
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginHorizontal: spacing.sm + 2,
          marginTop: spacing.sm,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
        }}
      >
        <Pressable accessibilityRole="link" accessibilityLabel="Ir a proyectos" onPress={() => router.push('/projects')}>
          <Brand compact />
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          {user ? (
            <View style={{ justifyContent: 'center' }}>
              <Badge tone="neutral" label={ROLE_LABEL[user.role]} icon="user" />
            </View>
          ) : null}
          <IconButton name="log-out" label="Cerrar sesión" onPress={closeSession} />
        </View>
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </SafeAreaView>
  );
}
