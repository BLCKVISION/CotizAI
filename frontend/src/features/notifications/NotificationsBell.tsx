/** Bell in the top bar with a dropdown of notices. Which ones were read is remembered in this browser. */
import { type Href, usePathname, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { useSesion } from '@/core/sesion/SesionProvider';
import { mensajeDeError } from '@/core/useDatos';
import { Texto } from '@/design/componentes';
import { Entrada } from '@/design/efectos';
import { LineIcon } from '@/design/LineIcon';
import { swatch, tint, useTema } from '@/design/tema';
import { espacio, radio } from '@/design/tokens';
import { useDismiss } from '@/design/useDismiss';
import { estadisticasApi } from '@/core/api/management';
import { listarProyectosApi } from '@/core/api/projects';

import { type AppNotification, buildNotifications } from './build';

const REFRESH_MS = 60_000;
const DOT = { action: swatch.amber600, ready: swatch.teal, info: swatch.blue700 } as const;
type PressState = { pressed: boolean; hovered?: boolean; focused?: boolean };

const readSeen = (key: string): string[] => {
  try {
    return JSON.parse((typeof window !== 'undefined' && window.localStorage?.getItem(key)) || '[]');
  } catch {
    return [];
  }
};

export function NotificationsBell() {
  const t = useTema();
  const router = useRouter();
  const path = usePathname();
  const { usuario, conSesion } = useSesion();
  const seenKey = `cotizai.notifications.seen.${usuario?.id ?? 'anonymous'}`;
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const menu = useDismiss(open, () => { setOpen(false); });
  const [, setVersion] = useState(0);
  const seen = readSeen(seenKey);
  const unread = (items ?? []).filter((n) => !seen.includes(n.id));

  const load = useCallback(async () => {
    try {
      const [projects, stats] = await conSesion((token) => Promise.all([listarProyectosApi(token), estadisticasApi(token)]));
      setItems(buildNotifications(projects, stats.propuestas_por_proyecto));
      setError(null);
    } catch (e) {
      setError(mensajeDeError(e));
    }
  }, [conSesion]);

  // Refresh when the screen changes, when the panel opens and once a minute.
  useEffect(() => {
    const first = setTimeout(load, 0);
    const every = setInterval(load, REFRESH_MS);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }, [load, path, open]);

  const markRead = (ids: string[]) => {
    try {
      window.localStorage.setItem(seenKey, JSON.stringify([...new Set([...readSeen(seenKey), ...ids])].slice(-200)));
    } catch {
      /* storage blocked: notices stay unread */
    }
    setVersion((v) => v + 1);
  };

  return (
    <View ref={menu} style={{ width: 44, height: 44, zIndex: 40 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={unread.length ? `Notificaciones: ${unread.length} sin leer` : 'Notificaciones'}
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        onPress={() => { setOpen((v) => !v); }}
        style={(e: PressState) => ({ width: 44, height: 44, borderRadius: radio.pildora, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: e.focused ? t.foco : 'transparent', backgroundColor: open || e.hovered || e.pressed ? swatch.white : tint.white(0.62) })}
      >
        <LineIcon name="bell" />
        {unread.length > 0 ? (
          <View style={{ position: 'absolute', top: 2, right: 2, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: swatch.red700, alignItems: 'center', justifyContent: 'center' }}>
            <Texto color={swatch.white} style={{ fontSize: 11, lineHeight: 14, fontFamily: 'Urbanist_700Bold' }}>
              {unread.length > 9 ? '9+' : unread.length}
            </Texto>
          </View>
        ) : null}
      </Pressable>
      {open ? (
        <View style={{ position: 'absolute', top: 52, right: -52, width: 340 }}>
          <Entrada>
            <View style={{ backgroundColor: swatch.white, borderRadius: radio.xl, padding: espacio.sm, gap: espacio.xs, shadowColor: swatch.navy, shadowOpacity: 0.16, shadowRadius: 28, shadowOffset: { width: 0, height: 14 } }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: espacio.sm, minHeight: 40 }}>
                <Texto variante="cuerpoMedio" accessibilityRole="header" style={{ fontFamily: 'Urbanist_600SemiBold' }}>
                  Notificaciones
                </Texto>
                {unread.length > 0 ? (
                  <Pressable accessibilityRole="button" onPress={() => { markRead(unread.map((n) => n.id)); }} style={{ minHeight: 40, justifyContent: 'center' }}>
                    <Texto variante="etiqueta" color={t.foco}>
                      Marcar como leídas
                    </Texto>
                  </Pressable>
                ) : null}
              </View>
              <ScrollView style={{ maxHeight: 360 }}>
                {error ? (
                  <Texto variante="pequeno" color={t.error.texto} style={{ padding: espacio.sm }}>
                    {error}
                  </Texto>
                ) : !items ? (
                  <Texto variante="pequeno" suave style={{ padding: espacio.sm }}>
                    Cargando…
                  </Texto>
                ) : items.length === 0 ? (
                  <Texto variante="pequeno" suave style={{ padding: espacio.sm }}>
                    No tiene notificaciones.
                  </Texto>
                ) : (
                  items.map((n) => {
                    const fresh = !seen.includes(n.id);
                    return (
                      <Pressable
                        key={n.id}
                        accessibilityRole="link"
                        accessibilityLabel={`${fresh ? 'Sin leer. ' : ''}${n.title}. ${n.detail}`}
                        onPress={() => {
                          markRead([n.id]);
                          setOpen(false);
                          router.push(`/proyectos/${n.projectId}` as Href);
                        }}
                        style={(e: PressState) => ({ flexDirection: 'row', gap: espacio.sm, padding: espacio.sm, borderRadius: radio.md, backgroundColor: e.hovered || e.pressed ? t.superficieAlta : 'transparent' })}
                      >
                        <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 5, backgroundColor: fresh ? DOT[n.tone] : 'transparent' }} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Texto variante="etiqueta">{n.title}</Texto>
                          <Texto variante="pequeno" suave numberOfLines={2}>
                            {n.detail}
                          </Texto>
                        </View>
                      </Pressable>
                    );
                  })
                )}
              </ScrollView>
            </View>
          </Entrada>
        </View>
      ) : null}
    </View>
  );
}
