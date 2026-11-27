/** "My activity": one large action to add proposals (or create the first project). */
import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, View } from 'react-native';

import { ACCEPT_DOCUMENTS, ACCEPT_PHOTOS, pickFiles } from '@/core/files';
import { Icono, type NombreIcono, Texto } from '@/design/componentes';
import { accentGradient, soloWeb, useReducirMovimiento } from '@/design/efectos';
import { innerSurface, Panel, RoundButton } from '@/design/Panel';
import { RollingLabel } from '@/design/RollingLabel';
import { useTema } from '@/design/tema';
import { espacio, radio, texto as tipografia } from '@/design/tokens';
import type { Proyecto } from '@/features/proyectos/api';

import type { UploadStatus } from './useProposalUpload';

type PressState = { pressed: boolean; hovered?: boolean; focused?: boolean };

/** Loop from 0 to 1; stays at 0 when the user asks for reduced motion. */
function useCycle(duration: number, delay = 0) {
  const reduce = useReducirMovimiento();
  const [value] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(Animated.timing(value, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true }));
    const start = setTimeout(() => loop.start(), delay);
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
      style={{ position: 'absolute', width: 68, height: 68, borderRadius: 34, borderWidth: 2, borderColor: '#FFFFFF', opacity: p.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 0.95, 0] }), transform: [{ scale: p.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] }) }] }}
    />
  );
}

/** Light band that crosses the action surface every few seconds. */
function Shine() {
  const p = useCycle(3600);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden', borderRadius: radio.panel }}>
      <Animated.View style={{ position: 'absolute', top: -40, bottom: -40, width: 150, left: '-30%', transform: [{ translateX: p.interpolate({ inputRange: [0, 0.55, 1], outputRange: [0, 1500, 1500] }) }, { rotate: '16deg' }] }}>
        <View style={{ flex: 1, ...soloWeb({ backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.65) 50%, rgba(255,255,255,0) 100%)' }) }} />
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
        <View style={{ width: 68, height: 68, borderRadius: radio.pildora, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#0E8FA8', shadowOpacity: 0.28, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, ...soloWeb({ transitionProperty: 'transform', transitionDuration: '420ms', transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)', transform: hovered ? 'scale(1.16) rotate(-8deg)' : 'scale(1) rotate(0deg)' }) }}>
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
  focus: Proyecto | null;
  canEdit: boolean;
  status: UploadStatus;
  onFiles: (files: File[]) => void;
  onNavigate: (path: string) => void;
};

export function ActivityCard({ focus, canEdit, status, onFiles, onNavigate }: Props) {
  const t = useTema();
  const [dragging, setDragging] = useState(false);
  const zone = useRef<ComponentRef<typeof View>>(null);
  const handler = useRef(onFiles);
  const canUpload = canEdit && focus?.estado === 'en_recepcion' && Platform.OS === 'web';
  const enabled = useRef(canUpload);
  useEffect(() => {
    handler.current = onFiles;
    enabled.current = canUpload;
  });
  useEffect(() => {
    const el = zone.current as unknown as HTMLElement | null;
    if (!el?.addEventListener) return;
    const over = (e: DragEvent) => {
      e.preventDefault();
      if (enabled.current) setDragging(true);
    };
    const leave = () => setDragging(false);
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

  const openFocus = () => onNavigate(focus ? `/proyectos/${focus.id}` : '/proyectos');
  const creating = canEdit && !focus;
  const action = canUpload
    ? { icon: 'plus' as const, title: 'Agregar propuestas', detail: 'Suba o arrastre fotos, PDF o Excel', run: () => !status.busy && pickFiles(`${ACCEPT_PHOTOS},${ACCEPT_DOCUMENTS}`, onFiles) }
    : creating
      ? { icon: 'folder-plus' as const, title: 'Agregar proyecto', detail: 'Empiece con el requerimiento y la ubicación', run: () => onNavigate('/proyectos/nuevo') }
      : { icon: 'folder' as const, title: focus ? 'Abrir proyecto' : 'Ver proyectos', detail: focus ? focus.nombre : 'Todavía no hay proyectos', run: openFocus };
  const feedback = status.errors[0] ?? status.message;

  return (
    <Panel
      title="Mi actividad"
      subtitle={focus ? `Las propuestas nuevas van a: ${focus.nombre}` : 'Empiece agregando un proyecto'}
      actions={<RoundButton icon="calendar" label="Abrir proyecto" onPress={openFocus} />}
    >
      <View ref={zone} style={{ ...innerSurface, padding: 16, gap: espacio.sm }}>
        <ColumnGuides />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${action.title}. ${action.detail}`}
          accessibilityState={{ busy: status.busy }}
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
              boxShadow: e.hovered ? '0 22px 44px -18px rgba(14,143,168,0.55)' : '0 12px 30px -22px rgba(14,143,168,0.5)',
              ...(e.hovered ? { transform: 'translateY(-3px)' } : null),
              ...(dragging ? { transform: 'scale(1.01)' } : null),
            }),
          })}
        >
          {({ hovered }: PressState) => (
            <>
              <Shine />
              <PulsingIcon icon={action.icon} hovered={Boolean(hovered)} />
              <RollingLabel text={status.busy ? 'Cargando…' : action.title} active={Boolean(hovered)} style={{ ...tipografia.subtitulo, lineHeight: 26, color: t.onAccent, fontFamily: 'Urbanist_600SemiBold' }} />
              <Texto variante="pequeno" color={t.onAccent} numberOfLines={1}>
                {action.detail}
              </Texto>
            </>
          )}
        </Pressable>
        {feedback ? (
          <Texto variante="pequeno" color={status.errors.length ? t.error.texto : t.textoSuave} numberOfLines={2} accessibilityLiveRegion="polite" style={{ textAlign: 'center' }}>
            {feedback}
          </Texto>
        ) : null}
      </View>
    </Panel>
  );
}
