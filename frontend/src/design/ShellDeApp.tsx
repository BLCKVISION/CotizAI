import { usePathname, useRouter } from 'expo-router';
import { type ReactNode } from 'react';
import { Pressable, type PressableStateCallbackType, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSesion } from '@/core/sesion/SesionProvider';

import { Avatar, BotonIcono, Icono, Insignia, Marca, type NombreIcono, Texto } from './componentes';
import { useDispositivo } from './dispositivo';
import { soloWeb, vidrio } from './efectos';
import { useTema } from './tema';
import { espacio, margenFlotante, radio, tamanoTactil } from './tokens';

const ETIQUETA_ROL = { cargador: 'Cargador', evaluador: 'Evaluador', aprobador: 'Aprobador', auditor: 'Auditor' } as const;

const NAVEGACION: { ruta: '/proyectos'; etiqueta: string; icono: NombreIcono }[] = [
  { ruta: '/proyectos', etiqueta: 'Proyectos', icono: 'folder' },
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
              {NAVEGACION.map((n) => (
                <ItemDeNavegacion
                  key={n.ruta}
                  etiqueta={n.etiqueta}
                  icono={n.icono}
                  activo={ruta.startsWith(n.ruta)}
                  onPress={() => router.push(n.ruta)}
                />
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
        <Pressable accessibilityRole="link" accessibilityLabel="Ir a proyectos" onPress={() => router.push('/proyectos')}>
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
      <View style={{ flex: 1 }}>{children}</View>
    </SafeAreaView>
  );
}
