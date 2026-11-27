/** "My activity": one large action to add proposals (or create the first project). */
import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, View } from 'react-native';

import { Icono, type NombreIcono, Texto } from '@/design/componentes';
import { accentGradient, soloWeb, useReducirMovimiento } from '@/design/efectos';
import { innerSurface, Panel, RoundButton } from '@/design/Panel';
import { RollingLabel } from '@/design/RollingLabel';
import { swatch, tint, useTema } from '@/design/tema';
import { espacio, radio, texto as tipografia } from '@/design/tokens';

type PressState = { pressed: boolean; hovered?: boolean; focused?: boolean };

/** Loop from 0 to 1; stays at 0 when the user asks for reduced motion. */
function useCycle(duration: number, delay = 0) {
  const reduce = useReducirMovimiento();
  const [value] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(Animated.timing(value, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true }));
    const start = setTimeout(() => { loop.start(); }, delay);
    return () => {
      clearTimeout(start);
      loop.stop();
    };
  }, [value, reduce, duration, delay]);
  return value;
}

/** A ring that grows out of the icon and fades, like a radar pulse. */
function Ring({ delay }: { delay: number }) {
  const p = useCycle(2400, delay);
  return (
    <Animated.View
      pointerEvents="none"
      style={{ position: 'absolute', width: 68, height: 68, borderRadius: 34, borderWidth: 2, borderColor: swatch.white, opacity: p.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 0.95, 0] }), transform: [{ scale: p.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] }) }] }}
    />
  );
}

/** Light band that crosses the action surface every few seconds. */
function Shine() {
  const p = useCycle(3600);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden', borderRadius: radio.panel }}>
      <Animated.View style={{ position: 'absolute', top: -40, bottom: -40, width: 150, left: '-30%', transform: [{ translateX: p.interpolate({ inputRange: [0, 0.55, 1], outputRange: [0, 1500, 1500] }) }, { rotate: '16deg' }] }}>
        <View style={{ flex: 1, ...soloWeb({ backgroundImage: `linear-gradient(90deg, ${tint.white(0)} 0%, ${tint.white(0.65)} 50%, ${tint.white(0)} 100%)` }) }} />
      </Animated.View>
    </View>
  );
}

/** Bouncing icon with pulse rings, so the main action is easy to notice. */
function PulsingIcon({ icon, hovered }: { icon: NombreIcono; hovered: boolean }) {
  const t = useTema();
  const p = useCycle(1800);
  return (
    <View style={{ width: 84, height: 84, alignItems: 'center', justifyContent: 'center' }}>
      <Ring delay={0} />
      <Ring delay={1200} />
      <Animated.View style={{ transform: [{ translateY: p.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, -10, 0, -3, 0] }) }] }}>
        <View style={{ width: 68, height: 68, borderRadius: radio.pildora, backgroundColor: swatch.white, alignItems: 'center', justifyContent: 'center', shadowColor: swatch.teal, shadowOpacity: 0.28, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, ...soloWeb({ transitionProperty: 'transform', transitionDuration: '420ms', transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)', transform: hovered ? 'scale(1.16) rotate(-8deg)' : 'scale(1) rotate(0deg)' }) }}>
          <Icono nombre={icon} tamano="lg" color={t.onAccent} />
        </View>
      </Animated.View>
    </View>
  );
}

/** Faint dashed columns behind the main action, like the schedule grid of the reference. */
function ColumnGuides() {
  const t = useTema();
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 16, bottom: 16, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-evenly' }}>
      {Array.from({ length: 7 }, (_, i) => (
        <View key={i} style={{ width: 0, borderLeftWidth: 1, borderStyle: 'dashed', borderColor: t.borde }} />
      ))}
    </View>
  );
}

type Props = {
  hasProjects: boolean;
  canEdit: boolean;
  busy: boolean;
  /** Called with the dropped files, or with none when the person clicks. */
  onAddProposals: (files: File[]) => void;
  onNavigate: (path: string) => void;
};

export function ActivityCard({ hasProjects, canEdit, busy, onAddProposals, onNavigate }: Props) {
  const t = useTema();
  const [dragging, setDragging] = useState(false);
  const zone = useRef<ComponentRef<typeof View>>(null);
  const handler = useRef(onAddProposals);
  const canUpload = canEdit && hasProjects && Platform.OS === 'web';
  const enabled = useRef(canUpload);
  useEffect(() => {
    handler.current = onAddProposals;
    enabled.current = canUpload;
  });
  useEffect(() => {
    const el = zone.current as unknown as HTMLElement | null;
    if (!el?.addEventListener) return;
    const over = (e: DragEvent) => {
      e.preventDefault();
      if (enabled.current) setDragging(true);
    };
    const leave = () => { setDragging(false); };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (enabled.current) handler.current(Array.from(e.dataTransfer?.files ?? []));
    };
    el.addEventListener('dragover', over);
    el.addEventListener('dragleave', leave);
    el.addEventListener('drop', drop);
    return () => {
      el.removeEventListener('dragover', over);
      el.removeEventListener('dragleave', leave);
      el.removeEventListener('drop', drop);
    };
  }, []);

  const creating = canEdit && !hasProjects;
  const action = canUpload
    ? { icon: 'plus' as const, title: 'Agregar propuestas', detail: 'Elija el proyecto y suba fotos, PDF o Excel', run: () => { if (!busy) onAddProposals([]); } }
    : creating
      ? { icon: 'folder-plus' as const, title: 'Agregar proyecto', detail: 'Empiece con el requerimiento y la ubicación', run: () => { onNavigate('/proyectos/nuevo'); } }
      : { icon: 'folder' as const, title: 'Ver proyectos', detail: hasProjects ? 'Consulte las propuestas y su evaluación' : 'Todavía no hay proyectos', run: () => { onNavigate('/proyectos'); } };

  return (
    <Panel
      title="Mi actividad"
      subtitle={!hasProjects ? 'Empiece agregando un proyecto' : canEdit ? 'Paso a paso: proyecto, archivos y evaluación' : 'Sus procesos de compra'}
      actions={<RoundButton icon="calendar" label="Ver proyectos" onPress={() => { onNavigate('/proyectos'); }} />}
    >
      <View ref={zone} style={{ ...innerSurface, padding: 16, gap: espacio.sm }}>
        <ColumnGuides />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${action.title}. ${action.detail}`}
          accessibilityState={{ busy }}
          onPress={action.run}
          style={(e: PressState) => ({
            flex: 1,
            minHeight: 150,
            alignItems: 'center',
            justifyContent: 'center',
            gap: espacio.sm,
            paddingHorizontal: espacio.md,
            borderRadius: radio.panel,
            borderWidth: 2,
            borderStyle: dragging ? 'dashed' : 'solid',
            borderColor: e.focused || dragging ? t.foco : 'transparent',
            ...accentGradient(115),
            ...soloWeb({
              transitionProperty: 'transform, box-shadow',
              transitionDuration: '360ms',
              transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
              boxShadow: e.hovered ? `0 22px 44px -18px ${tint.teal(0.55)}` : `0 12px 30px -22px ${tint.teal(0.5)}`,
              ...(e.hovered ? { transform: 'translateY(-3px)' } : null),
              ...(dragging ? { transform: 'scale(1.01)' } : null),
            }),
          })}
        >
          {({ hovered }: PressState) => (
            <>
              <Shine />
              <PulsingIcon icon={action.icon} hovered={Boolean(hovered)} />
              <RollingLabel text={busy ? 'Cargando…' : action.title} active={Boolean(hovered)} style={{ ...tipografia.subtitulo, lineHeight: 26, color: t.onAccent, fontFamily: 'Urbanist_600SemiBold' }} />
              <Texto variante="pequeno" color={t.onAccent} numberOfLines={1}>
                {action.detail}
              </Texto>
            </>
          )}
        </Pressable>
      </View>
    </Panel>
  );
}
