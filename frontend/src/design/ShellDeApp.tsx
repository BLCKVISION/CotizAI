import { type Href, usePathname, useRouter } from 'expo-router';
import { type ReactNode } from 'react';
import { Pressable, type PressableStateCallbackType, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSesion } from '@/core/sesion/SesionProvider';

import { Avatar, BotonIcono, Chip, Icono, Insignia, Marca, type NombreIcono, Texto } from './componentes';
import { useDispositivo } from './dispositivo';
import { soloWeb, vidrio } from './efectos';
import { useTema } from './tema';
import { espacio, margenFlotante, radio, tamanoTactil } from './tokens';

const ETIQUETA_ROL = { cargador: 'Cargador', evaluador: 'Evaluador', aprobador: 'Aprobador', auditor: 'Auditor' } as const;

type Item = { ruta: string; etiqueta: string; icono: NombreIcono; soloRol?: 'auditor' };
const NAVEGACION: { categoria: string; items: Item[] }[] = [
  { categoria: 'GENERAL', items: [
    { ruta: '/resumen', etiqueta: 'Resumen', icono: 'home' },
    { ruta: '/estadisticas', etiqueta: 'Estadísticas', icono: 'bar-chart-2' },
  ] },
  { categoria: 'COMPRAS', items: [
    { ruta: '/proyectos', etiqueta: 'Proyectos', icono: 'folder' },
    { ruta: '/proveedores', etiqueta: 'Proveedores', icono: 'briefcase' },
  ] },
  { categoria: 'CONTROL', items: [{ ruta: '/auditoria', etiqueta: 'Auditoría', icono: 'shield', soloRol: 'auditor' }] },
];

/** Ítem de la barra lateral: píldora radio 15; activo = blanco puro elevado, texto negro y punto lima (Relay claro). */
function ItemDeNavegacion({ etiqueta, icono, activo, peligro = false, onPress }: { etiqueta: string; icono: NombreIcono; activo: boolean; peligro?: boolean; onPress: () => void }) {
  const t = useTema();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={etiqueta}
      accessibilityState={{ selected: activo }}
      onPress={onPress}
      style={(e: { pressed: boolean; hovered?: boolean; focused?: boolean }) => ({
        minHeight: tamanoTactil,
        flexDirection: 'row',
        alignItems: 'center',
        gap: espacio.sm + 2,
        paddingHorizontal: espacio.md,
        borderRadius: radio.nav,
        borderWidth: 2,
        borderColor: e.focused ? t.foco : activo ? 'rgba(15,23,42,0.08)' : 'transparent',
        backgroundColor: activo ? '#FFFFFF' : e.hovered || e.pressed ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.40)',
        ...(activo
          ? { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 3 }
          : null),
        ...soloWeb({
          transitionProperty: 'transform, box-shadow, background-color',
          transitionDuration: '220ms',
          transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
          ...(activo ? { transform: 'translateY(-1px)', boxShadow: '0 8px 24px -2px rgba(0,0,0,.08), 0 2px 6px rgba(0,0,0,.04)' } : null),
        }),
      })}
    >
      {({ hovered }: PressableStateCallbackType & { hovered?: boolean }) => (
        <>
          <Icono nombre={icono} color={peligro && hovered ? t.error.texto : activo || hovered ? t.texto : t.textoSuave} />
          <Texto
            variante={activo ? 'etiqueta' : 'cuerpoMedio'}
            color={peligro && hovered ? t.error.texto : activo || hovered ? t.texto : t.textoSuave}
            style={{ flex: 1, fontSize: 15 }}
          >
            {etiqueta}
          </Texto>
          {activo ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.lima, borderWidth: 1, borderColor: 'rgba(0,0,0,0.25)' }} /> : null}
        </>
      )}
    </Pressable>
  );
}

export function ShellDeApp({ children }: { children: ReactNode }) {
  const router = useRouter();
  const ruta = usePathname();
  const { dispositivo } = useDispositivo();
  const { usuario, cerrarSesion } = useSesion();
  const esEscritorio = dispositivo === 'escritorio';
  const categorias = NAVEGACION.map((c) => ({ ...c, items: c.items.filter((i) => !i.soloRol || i.soloRol === usuario?.rol) })).filter(
    (c) => c.items.length > 0,
  );
  const ir = (destino: string) => router.push(destino as Href);
  const iniciales = (usuario?.correo ?? '??').slice(0, 2);

  if (esEscritorio) {
    return (
      <View style={{ flex: 1, flexDirection: 'row', padding: margenFlotante, gap: margenFlotante + 6 }}>
        {/* Sidebar flotante: radio 28, blanco .82 con blur 32 */}
        <View
          style={{
            ...vidrio({ opacidad: 0.82, blur: 32, radio: radio.panel }),
            width: 264,
            padding: espacio.md,
            paddingTop: espacio.lg,
            justifyContent: 'space-between',
          }}
        >
          <View style={{ gap: espacio.lg }}>
            <View style={{ paddingHorizontal: espacio.sm }}>
              <Marca />
            </View>
            <View style={{ height: 1, backgroundColor: 'rgba(15,23,42,0.06)' }} />
            <View accessibilityRole="menu" style={{ gap: espacio.xs + 2 }}>
              {categorias.map((c) => (
                <View key={c.categoria} style={{ gap: espacio.xs, marginBottom: espacio.sm }}>
                  <Texto variante="sobretitulo" suave style={{ paddingHorizontal: espacio.md }}>
                    {c.categoria}
                  </Texto>
                  {c.items.map((n) => (
                    <ItemDeNavegacion key={n.ruta} etiqueta={n.etiqueta} icono={n.icono} activo={ruta.startsWith(n.ruta)} onPress={() => ir(n.ruta)} />
                  ))}
                </View>
              ))}
            </View>
          </View>
          <View style={{ gap: espacio.md }}>
            <View style={{ height: 1, backgroundColor: 'rgba(15,23,42,0.06)' }} />
            <View style={{ flexDirection: 'row', gap: espacio.sm + 2, alignItems: 'center', paddingHorizontal: espacio.sm }}>
              <Avatar texto={iniciales} />
              <View style={{ flex: 1, gap: 2 }}>
                <Texto variante="pequeno" numberOfLines={1}>
                  {usuario?.correo}
                </Texto>
                <Texto variante="pequeno" suave>
                  {usuario ? ETIQUETA_ROL[usuario.rol] : ''}
                </Texto>
              </View>
            </View>
            <ItemDeNavegacion etiqueta="Cerrar sesión" icono="log-out" activo={false} peligro onPress={cerrarSesion} />
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
          ...vidrio({ opacidad: 0.82, blur: 32, radio: radio.xl }),
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginHorizontal: espacio.sm + 2,
          marginTop: espacio.sm,
          paddingHorizontal: espacio.md,
          paddingVertical: espacio.sm,
        }}
      >
        <Pressable accessibilityRole="link" accessibilityLabel="Ir al resumen" onPress={() => ir('/resumen')}>
          <Marca compacta />
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.xs }}>
          {usuario ? (
            <View style={{ justifyContent: 'center' }}>
              <Insignia tono="neutro" etiqueta={ETIQUETA_ROL[usuario.rol]} icono="user" />
            </View>
          ) : null}
          <BotonIcono nombre="log-out" etiqueta="Cerrar sesión" onPress={cerrarSesion} />
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: espacio.sm, paddingHorizontal: espacio.md, paddingTop: espacio.sm }}>
        {categorias.flatMap((c) => c.items).map((n) => (
          <Chip key={n.ruta} etiqueta={n.etiqueta} seleccionado={ruta.startsWith(n.ruta)} onPress={() => ir(n.ruta)} />
        ))}
      </ScrollView>
      <View style={{ flex: 1 }}>{children}</View>
    </SafeAreaView>
  );
}
