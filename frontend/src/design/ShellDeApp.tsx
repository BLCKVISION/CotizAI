import { type Href, usePathname, useRouter } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSesion } from '@/core/sesion/SesionProvider';

import { BrandRow, Isotype } from './Brand';
import { BotonIcono, Chip, Insignia, Texto } from './componentes';
import { ConfirmDialog } from './ConfirmDialog';
import { useDispositivo } from './dispositivo';
import { soloWeb, vidrio } from './efectos';
import { LineIcon, type LineIconName } from './LineIcon';
import { swatch, tint, useTema } from './tema';
import { UserBubble } from './UserBubble';
import { espacio, margenFlotante, radio } from './tokens';

const SIDEBAR_KEY = 'cotizai.sidebar.expanded';
const readExpanded = () => {
  try {
    return typeof window !== 'undefined' && window.localStorage?.getItem(SIDEBAR_KEY) === '1';
  } catch {
    return false;
  }
};

const ETIQUETA_ROL = { cargador: 'Cargador', evaluador: 'Evaluador', aprobador: 'Aprobador', auditor: 'Auditor', coordinador: 'Coordinador' } as const;

type Item = { ruta: string; etiqueta: string; icono: LineIconName; soloRol?: 'auditor' };
const NAVEGACION: { categoria: string; items: Item[] }[] = [
  { categoria: 'GENERAL', items: [
    { ruta: '/home', etiqueta: 'Home', icono: 'home' },
    { ruta: '/estadisticas', etiqueta: 'Estadísticas', icono: 'bar-chart-2' },
  ] },
  { categoria: 'COMPRAS', items: [
    { ruta: '/proyectos', etiqueta: 'Proyectos', icono: 'folder' },
    { ruta: '/proveedores', etiqueta: 'Proveedores', icono: 'briefcase' },
  ] },
  { categoria: 'CONTROL', items: [{ ruta: '/equipo', etiqueta: 'Equipo', icono: 'user' }, { ruta: '/auditoria', etiqueta: 'Auditoría', icono: 'shield', soloRol: 'auditor' }] },
];

const RAIL_COLLAPSED = 72;
const RAIL_EXPANDED = 216;
const CIRCLE = 44;
const easing = 'cubic-bezier(0.16, 1, 0.3, 1)';

type RailState = { pressed: boolean; hovered?: boolean; focused?: boolean };

/** Rail item: a circle with the icon (dark when active). When expanded the pill grows and the label fades in. */
function RailItem({ label, icon, active = false, expanded, onPress, expandable, danger = false }: { label: string; icon: LineIconName; active?: boolean; expanded: boolean; onPress: () => void; expandable?: boolean; danger?: boolean }) {
  const t = useTema();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={expandable ? { expanded } : { selected: active }}
      onPress={onPress}
      {...({ title: expanded ? undefined : label } as object)}
      style={(e: RailState) => ({
        height: CIRCLE,
        width: expanded ? RAIL_EXPANDED - 24 : CIRCLE,
        marginLeft: (RAIL_COLLAPSED - CIRCLE) / 2,
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: radio.pildora,
        overflow: 'hidden',
        borderWidth: 2,
        borderColor: e.focused ? t.foco : 'transparent',
        backgroundColor: active ? t.primario : e.hovered || e.pressed ? swatch.white : tint.white(0.62),
        ...soloWeb({ transitionProperty: 'width, background-color', transitionDuration: '320ms', transitionTimingFunction: easing }),
      })}
    >
      <View style={{ width: CIRCLE - 4, alignItems: 'center' }}>
        <LineIcon name={icon} color={danger ? t.error.texto : active ? swatch.white : t.texto} />
      </View>
      <View style={{ width: RAIL_EXPANDED - 24 - CIRCLE, opacity: expanded ? 1 : 0, ...soloWeb({ transitionProperty: 'opacity', transitionDuration: expanded ? '320ms' : '140ms' }) }}>
        <Texto variante="etiqueta" numberOfLines={1} color={danger ? t.error.texto : active ? swatch.white : t.texto}>
          {label}
        </Texto>
      </View>
    </Pressable>
  );
}

type ShellProps = {
  children: ReactNode;
  /** Shown in the top bar. */
  notifications: ReactNode;
  /** Floating layers above the content, such as the tour and the assistant. */
  overlays: ReactNode;
};

export function ShellDeApp({ children, notifications, overlays }: ShellProps) {
  const router = useRouter();
  const ruta = usePathname();
  const { dispositivo } = useDispositivo();
  const { usuario, cerrarSesion } = useSesion();
  const esEscritorio = dispositivo === 'escritorio';
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const askToSignOut = () => setConfirmingSignOut(true);
  const signOutDialog = (
    <ConfirmDialog
      visible={confirmingSignOut}
      title="¿Cerrar sesión?"
      description="Tendrá que escribir su correo y contraseña para volver a entrar."
      confirmLabel="Sí, cerrar sesión"
      confirmIcon="log-out"
      onCancel={() => setConfirmingSignOut(false)}
      onConfirm={() => {
        setConfirmingSignOut(false);
        void cerrarSesion();
      }}
    />
  );
  const categorias = NAVEGACION.map((c) => ({ ...c, items: c.items.filter((i) => !i.soloRol || i.soloRol === usuario?.rol) })).filter(
    (c) => c.items.length > 0,
  );
  const ir = (destino: string) => router.push(destino as Href);
  const [expanded, setExpanded] = useState(readExpanded);
  const toggleSidebar = () =>
    setExpanded((v) => {
      try {
        window.localStorage.setItem(SIDEBAR_KEY, v ? '0' : '1'); // UI preference only, never data
      } catch {
        /* storage blocked: the choice simply is not remembered */
      }
      return !v;
    });

  if (esEscritorio) {
    const items = categorias.flatMap((c) => c.items);
    return (
      <View style={{ flex: 1 }}>
        {/* Top bar: only the isotype, notifications and the account bubble. */}
        <View style={{ height: 76, flexDirection: 'row', alignItems: 'center', paddingLeft: margenFlotante, paddingRight: espacio.lg, zIndex: 30 }}>
          <Pressable accessibilityRole="link" accessibilityLabel="Ir a Home" onPress={() => ir('/home')} style={{ width: RAIL_COLLAPSED, alignItems: 'center' }}>
            <Isotype size={48} />
          </Pressable>
          <View style={{ flex: 1 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.sm }}>
            {notifications}
            <UserBubble name={usuario?.display_name || usuario?.correo || '??'} role={usuario ? ETIQUETA_ROL[usuario.rol] : ''} onSignOut={askToSignOut} />
          </View>
        </View>

        <View style={{ flex: 1, flexDirection: 'row', paddingLeft: margenFlotante, minHeight: 0, zIndex: 1 }}>
          {/* Menu and sections stay grouped in the vertical middle; sign-out sits at the bottom. */}
          <View
            style={{
              width: expanded ? RAIL_EXPANDED : RAIL_COLLAPSED,
              overflow: 'hidden',
              ...soloWeb({ transitionProperty: 'width', transitionDuration: '320ms', transitionTimingFunction: easing }),
            }}
          >
            {/* The negative top margin offsets the top bar so the group is centred on the whole screen. */}
            <View style={{ flex: 1, justifyContent: 'center', marginTop: -76, paddingTop: 0, gap: espacio.sm }}>
              <RailItem label={expanded ? 'Contraer menú' : 'Expandir menú'} icon="menu" expandable expanded={expanded} onPress={toggleSidebar} />
              <View accessibilityRole="menu" style={{ gap: espacio.sm }}>
                {items.map((n) => (
                  <RailItem key={n.ruta} label={n.etiqueta} icon={n.icono} expanded={expanded} active={ruta.startsWith(n.ruta)} onPress={() => ir(n.ruta)} />
                ))}
              </View>
            </View>
            <View style={{ paddingBottom: espacio.lg }}>
              <RailItem label="Cerrar sesión" icon="log-out" danger expanded={expanded} onPress={askToSignOut} />
            </View>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
        </View>
        {overlays}
        {signOutDialog}
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View
        style={{
          ...vidrio({ opacidad: 0.82, blur: 32, radio: radio.xl }),
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginHorizontal: espacio.sm + 2,
          marginTop: espacio.sm,
          paddingHorizontal: espacio.md,
          paddingVertical: espacio.sm,
          zIndex: 30,
        }}
      >
        <Pressable accessibilityRole="link" accessibilityLabel="Ir a Home" onPress={() => ir('/home')}>
          <BrandRow size={36} />
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.xs }}>
          {usuario ? (
            <View style={{ justifyContent: 'center' }}>
              <Insignia tono="neutro" etiqueta={ETIQUETA_ROL[usuario.rol]} icono="user" />
            </View>
          ) : null}
          {notifications}
          <BotonIcono nombre="log-out" etiqueta="Cerrar sesión" onPress={askToSignOut} />
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: espacio.sm, paddingHorizontal: espacio.md, paddingTop: espacio.sm }}>
        {categorias.flatMap((c) => c.items).map((n) => (
          <Chip key={n.ruta} etiqueta={n.etiqueta} seleccionado={ruta.startsWith(n.ruta)} onPress={() => ir(n.ruta)} />
        ))}
      </ScrollView>
      <View style={{ flex: 1 }}>{children}</View>
      {overlays}
      {signOutDialog}
    </SafeAreaView>
  );
}
