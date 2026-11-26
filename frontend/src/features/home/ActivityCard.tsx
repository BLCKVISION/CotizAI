/** "My activity": one large action to add proposals (or create the first project). */
import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, View } from 'react-native';

import { ACCEPT_DOCUMENTS, ACCEPT_PHOTOS, pickFiles } from '@/core/files';
import { Icono, type NombreIcono, Texto } from '@/design/componentes';
import { accentGradient, soloWeb, useReducirMovimiento } from '@/design/efectos';
import { innerSurface, Panel, RoundButton } from '@/design/Panel';
import { useTema } from '@/design/tema';
import { espacio, radio } from '@/design/tokens';
import type { Proyecto } from '@/features/proyectos/api';

import type { UploadStatus } from './useProposalUpload';

type PressState = { pressed: boolean; hovered?: boolean; focused?: boolean };

/** Gentle floating icon; stays still when the user asks for reduced motion. */
function FloatingIcon({ icon }: { icon: NombreIcono }) {
  const reduce = useReducirMovimiento();
  const [offset] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduce) return;
    const step = (toValue: number) => Animated.timing(offset, { toValue, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true });
    const loop = Animated.loop(Animated.sequence([step(-5), step(0)]));
    loop.start();
    return () => loop.stop();
  }, [offset, reduce]);
  const t = useTema();
  return (
    <Animated.View style={{ transform: [{ translateY: offset }] }}>
      <View style={{ width: 60, height: 60, borderRadius: radio.pildora, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#0E8FA8', shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } }}>
        <Icono nombre={icon} tamano="lg" color={t.onAccent} />
      </View>
    </Animated.View>
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
          <FloatingIcon icon={action.icon} />
          <Texto variante="subtitulo" color={t.onAccent} style={{ fontFamily: 'Urbanist_600SemiBold' }}>
            {status.busy ? 'Cargando…' : action.title}
          </Texto>
          <Texto variante="pequeno" color={t.onAccent} numberOfLines={1}>
            {action.detail}
          </Texto>
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
