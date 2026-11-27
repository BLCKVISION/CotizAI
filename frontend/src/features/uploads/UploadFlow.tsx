/** Live view of an upload: each file travels from the queue to "saved" or "rejected", as the server answers. */
import { useEffect, useState } from 'react';
import { Animated, Easing, View } from 'react-native';

import { Boton, Icono, type NombreIcono, Texto } from '@/design/componentes';
import { accentGradient, Entrada, useReducirMovimiento } from '@/design/efectos';
import { Lightbox } from '@/design/Lightbox';
import { useTema } from '@/design/tema';
import { espacio, radio } from '@/design/tokens';
import type { UploadItem } from '@/features/home/useProposalUpload';

const FILE_ICONS: Record<string, NombreIcono> = { pdf: 'file-text', jpg: 'image', jpeg: 'image', png: 'message-square', xlsx: 'grid' };
const iconFor = (name: string) => FILE_ICONS[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'file';
const sizeLabel = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

const STAGES: { icon: NombreIcono; label: string }[] = [
  { icon: 'file', label: 'Su archivo' },
  { icon: 'shield', label: 'Validación' },
  { icon: 'lock', label: 'Cifrado AES-256' },
  { icon: 'folder', label: 'Expediente' },
];

function useLoop(active: boolean, duration: number) {
  const reduce = useReducirMovimiento();
  const [value] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!active || reduce) return;
    value.setValue(0);
    const loop = Animated.loop(Animated.timing(value, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: false }));
    loop.start();
    return () => loop.stop();
  }, [active, reduce, value, duration]);
  return value;
}

/** The path every file follows, with a dot travelling along it while something is being sent. */
function Pipeline({ active }: { active: boolean }) {
  const t = useTema();
  const travel = useLoop(active, 1500);
  return (
    <View accessibilityLabel="Cada archivo se valida, se cifra y se guarda en el expediente" style={{ paddingVertical: espacio.sm }}>
      <View style={{ position: 'absolute', left: '12.5%', right: '12.5%', top: espacio.sm + 21, height: 3, borderRadius: 2, backgroundColor: t.superficieAlta }}>
        {active ? (
          <Animated.View style={{ position: 'absolute', top: -4, width: 11, height: 11, borderRadius: 6, backgroundColor: t.accentStrong, left: travel.interpolate({ inputRange: [0, 1], outputRange: ['0%', '97%'] }) }} />
        ) : null}
      </View>
      <View style={{ flexDirection: 'row' }}>
        {STAGES.map((s) => (
          <View key={s.label} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
            <View style={{ width: 42, height: 42, borderRadius: radio.pildora, alignItems: 'center', justifyContent: 'center', ...accentGradient(135) }}>
              <Icono nombre={s.icon} tamano="sm" color={t.onAccent} />
            </View>
            <Texto variante="pequeno" suave style={{ textAlign: 'center' }}>
              {s.label}
            </Texto>
          </View>
        ))}
      </View>
    </View>
  );
}

function Row({ item }: { item: UploadItem }) {
  const t = useTema();
  const sweep = useLoop(item.state === 'uploading', 1100);
  const status = { waiting: 'En cola', uploading: 'Validando, cifrando y guardando…', saved: 'Guardada en el expediente', rejected: item.reason ?? 'Rechazada' }[item.state];
  const rejected = item.state === 'rejected';
  return (
    <View accessible accessibilityLabel={`${item.name}: ${status}`} style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.sm + 4, padding: espacio.sm + 2, borderRadius: radio.lg, backgroundColor: rejected ? t.error.fondo : t.superficieAlta, opacity: item.state === 'waiting' ? 0.6 : 1 }}>
      <View style={{ width: 38, height: 38, borderRadius: radio.md, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' }}>
        <Icono nombre={iconFor(item.name)} tamano="sm" />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Texto variante="etiqueta" numberOfLines={1}>
          {item.name}
        </Texto>
        <Texto variante="pequeno" color={rejected ? t.error.texto : t.textoSuave} numberOfLines={2}>
          {status}
        </Texto>
        {item.state === 'uploading' ? (
          <View style={{ height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: '#FFFFFF' }}>
            <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, width: '40%', borderRadius: 2, left: sweep.interpolate({ inputRange: [0, 1], outputRange: ['-40%', '100%'] }), backgroundColor: t.accentStrong }} />
          </View>
        ) : null}
      </View>
      <Texto variante="pequeno" suave>
        {sizeLabel(item.size)}
      </Texto>
      {item.state === 'saved' || rejected ? (
        <Entrada>
          <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: rejected ? t.error.texto : t.accent }}>
            <Icono nombre={rejected ? 'x' : 'check'} tamano="sm" color={rejected ? '#FFFFFF' : t.onAccent} />
          </View>
        </Entrada>
      ) : (
        <View style={{ width: 28 }} />
      )}
    </View>
  );
}

export function UploadFlow({ visible, items, busy, onClose }: { visible: boolean; items: UploadItem[]; busy: boolean; onClose: () => void }) {
  const t = useTema();
  const done = items.filter((i) => i.state === 'saved' || i.state === 'rejected').length;
  const saved = items.filter((i) => i.state === 'saved').length;
  const title = busy ? `Cargando propuesta ${Math.min(done + 1, items.length)} de ${items.length}` : saved === items.length ? 'Carga completada' : saved === 0 ? 'No se cargó ningún archivo' : 'Carga completada con observaciones';
  return (
    <Lightbox visible={visible} title={title} description={busy ? 'Puede cerrar esta ventana: la carga continúa.' : `${saved} ${saved === 1 ? 'guardada' : 'guardadas'} · ${items.length - saved} ${items.length - saved === 1 ? 'rechazada' : 'rechazadas'}`} onClose={onClose}>
      <Pipeline active={busy} />
      <View accessibilityRole="progressbar" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={done} style={{ height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: t.superficieAlta }}>
        <View style={{ height: 8, width: `${items.length ? (done / items.length) * 100 : 0}%`, borderRadius: 4, ...accentGradient(90) }} />
      </View>
      <View style={{ gap: espacio.sm }}>
        {items.map((item) => (
          <Row key={item.key} item={item} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
        <Boton etiqueta={busy ? 'Seguir en segundo plano' : 'Listo'} variante={busy ? 'secundario' : 'primario'} icono={busy ? undefined : 'check'} onPress={onClose} />
      </View>
    </Lightbox>
  );
}
