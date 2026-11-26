import { Feather } from '@expo/vector-icons';
import { type ComponentProps, type ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  type PressableStateCallbackType,
  Text,
  TextInput,
  type TextInputProps,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';

import { soloWeb, vidrio } from './efectos';
import { useTema } from './tema';
import { espacio, fuente, icono as tamanoIcono, radio, tamanoTactil, texto } from './tokens';

type EstadoPressable = PressableStateCallbackType & { hovered?: boolean; focused?: boolean };
export type NombreIcono = ComponentProps<typeof Feather>['name'];

/* ───────────── Icono ───────────── */
/** Decorativo por defecto (oculto a lectores de pantalla); si porta significado propio, pasar `etiqueta`. */
export function Icono({
  nombre,
  tamano = 'md',
  color,
  etiqueta,
}: {
  nombre: NombreIcono;
  tamano?: keyof typeof tamanoIcono;
  color?: string;
  etiqueta?: string;
}) {
  const t = useTema();
  return (
    <Feather
      name={nombre}
      size={tamanoIcono[tamano]}
      color={color ?? t.texto}
      accessibilityElementsHidden={!etiqueta}
      importantForAccessibility={etiqueta ? 'yes' : 'no-hide-descendants'}
      accessibilityLabel={etiqueta}
    />
  );
}

/* ───────────── Texto ───────────── */
type Variante = keyof typeof texto;
export function Texto({
  variante = 'cuerpo',
  suave = false,
  color,
  style,
  ...props
}: ComponentProps<typeof Text> & { variante?: Variante; suave?: boolean; color?: string }) {
  const t = useTema();
  const base: TextStyle = { ...texto[variante], color: color ?? (suave ? t.textoSuave : t.texto) };
  return <Text {...props} style={[base, style]} />;
}

/* ───────────── Botón ───────────── */
export function Boton({
  etiqueta,
  onPress,
  variante = 'primario',
  icono,
  cargando = false,
  deshabilitado = false,
  anchoCompleto = false,
}: {
  etiqueta: string;
  onPress: () => void;
  variante?: 'primario' | 'secundario' | 'fantasma';
  icono?: NombreIcono;
  cargando?: boolean;
  deshabilitado?: boolean;
  anchoCompleto?: boolean;
}) {
  const t = useTema();
  const inactivo = cargando || deshabilitado;
  const colorTexto = variante === 'primario' ? t.sobreLima : t.texto;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      accessibilityState={{ disabled: inactivo, busy: cargando }}
      disabled={inactivo}
      onPress={onPress}
      style={(e: EstadoPressable): ViewStyle => ({
        minHeight: tamanoTactil,
        borderRadius: radio.pildora,
        paddingHorizontal: espacio.lg,
        flexDirection: 'row',
        gap: espacio.sm,
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: anchoCompleto ? 'stretch' : 'flex-start',
        borderWidth: 2, // constante: el foco cambia solo el color y no desplaza el layout
        borderColor: e.focused ? t.foco : variante === 'secundario' ? 'rgba(15,23,42,0.14)' : variante === 'primario' ? 'rgba(0,0,0,0.12)' : 'transparent',
        backgroundColor:
          variante === 'primario'
            ? e.pressed
              ? t.limaPresionado
              : t.lima
            : variante === 'secundario'
              ? e.pressed || e.hovered
                ? '#FFFFFF'
                : 'rgba(255,255,255,0.75)'
              : e.pressed || e.hovered
                ? 'rgba(15,23,42,0.05)'
                : 'transparent',
        opacity: inactivo ? 0.55 : 1,
        ...(variante === 'primario' && !inactivo
          ? { shadowColor: t.lima, shadowOpacity: e.hovered ? 0.65 : 0.45, shadowRadius: e.hovered ? 16 : 10, shadowOffset: { width: 0, height: 2 } }
          : null),
        ...soloWeb({
          transitionProperty: 'background-color, box-shadow, transform',
          transitionDuration: '220ms',
          transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
          ...(e.hovered && !inactivo ? { transform: 'translateY(-1px)' } : null),
        }),
      })}
    >
      {cargando ? (
        <ActivityIndicator color={colorTexto} />
      ) : (
        <>
          {icono ? <Icono nombre={icono} color={colorTexto} /> : null}
          <Text style={{ ...texto.etiqueta, fontSize: 16, color: colorTexto }}>{etiqueta}</Text>
        </>
      )}
    </Pressable>
  );
}

/** Botón solo de icono: área táctil de 48 y nombre accesible obligatorio. */
export function BotonIcono({ nombre, etiqueta, onPress }: { nombre: NombreIcono; etiqueta: string; onPress: () => void }) {
  const t = useTema();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      onPress={onPress}
      hitSlop={4}
      style={(e: EstadoPressable): ViewStyle => ({
        width: tamanoTactil,
        height: tamanoTactil,
        borderRadius: radio.md,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: e.focused ? t.foco : 'transparent',
        backgroundColor: e.pressed || e.hovered ? t.superficieAlta : 'transparent',
      })}
    >
      <Icono nombre={nombre} />
    </Pressable>
  );
}

/* ───────────── Campo de texto ───────────── */
type CampoProps = TextInputProps & { etiqueta: string; error?: string; ayuda?: string; icono?: NombreIcono };
export function CampoDeTexto({ etiqueta, error, ayuda, icono, secureTextEntry, multiline, ...props }: CampoProps) {
  const t = useTema();
  const [enfocado, setEnfocado] = useState(false);
  const [visible, setVisible] = useState(false);
  const esSecreto = Boolean(secureTextEntry);
  const colorBorde = error ? t.error.texto : enfocado ? t.foco : t.bordeControl;

  return (
    <View style={{ gap: espacio.xs }}>
      <Texto variante="etiqueta">{etiqueta}</Texto>
      <View
        style={{
          flexDirection: 'row',
          alignItems: multiline ? 'flex-start' : 'center',
          minHeight: tamanoTactil,
          borderRadius: radio.nav,
          backgroundColor: 'rgba(255,255,255,0.92)',
          borderWidth: 2,
          borderColor: colorBorde,
          paddingLeft: espacio.md,
          gap: espacio.sm,
        }}
      >
        {icono ? (
          <View style={{ paddingTop: multiline ? espacio.md : 0 }}>
            <Icono nombre={icono} color={t.textoSuave} />
          </View>
        ) : null}
        <TextInput
          {...props}
          multiline={multiline}
          secureTextEntry={esSecreto && !visible}
          accessibilityLabel={etiqueta}
          accessibilityHint={error ?? ayuda}
          aria-invalid={Boolean(error)}
          onFocus={(e) => {
            setEnfocado(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setEnfocado(false);
            props.onBlur?.(e);
          }}
          placeholderTextColor={t.textoSuave}
          style={[
            {
              ...texto.cuerpo,
              flex: 1,
              color: t.texto,
              paddingVertical: multiline ? espacio.md : espacio.sm,
              paddingRight: esSecreto ? 0 : espacio.md,
              minHeight: multiline ? 112 : undefined,
              textAlignVertical: multiline ? 'top' : 'center',
              outlineWidth: 0,
            },
            soloWeb({ outlineStyle: 'none' }) as TextStyle, // el foco lo marca el borde del contenedor
          ]}
        />
        {esSecreto ? (
          <BotonIcono
            nombre={visible ? 'eye-off' : 'eye'}
            etiqueta={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            onPress={() => setVisible((v) => !v)}
          />
        ) : null}
      </View>
      {error ? (
        <View style={{ flexDirection: 'row', gap: espacio.xs, alignItems: 'center' }} accessibilityLiveRegion="polite">
          <Icono nombre="alert-circle" tamano="sm" color={t.error.texto} />
          <Texto variante="pequeno" color={t.error.texto} style={{ flex: 1 }}>
            {error}
          </Texto>
        </View>
      ) : ayuda ? (
        <Texto variante="pequeno" suave>
          {ayuda}
        </Texto>
      ) : null}
    </View>
  );
}

/* ───────────── Tarjeta ───────────── */
export function Tarjeta({
  children,
  onPress,
  etiquetaAccesible,
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  etiquetaAccesible?: string;
  style?: ViewStyle;
}) {
  const t = useTema();
  const base = (e?: EstadoPressable): ViewStyle => ({
    ...vidrio({ radio: radio.xl, elevado: Boolean(e?.hovered) }),
    borderWidth: e?.focused ? 2 : 1,
    ...(e?.focused ? { borderColor: t.foco } : null),
    padding: espacio.lg,
    gap: espacio.sm,
    ...(e?.hovered ? soloWeb({ transform: 'translateY(-2px)' }) : null), // hover: sube 2 px, como en Relay
    ...style,
  });
  if (!onPress) return <View style={base()}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={etiquetaAccesible}
      onPress={onPress}
      style={(e: EstadoPressable) => ({ ...base(e), opacity: e.pressed ? 0.85 : 1 })}
    >
      {children}
    </Pressable>
  );
}

/* ───────────── Insignia de estado (color + icono + texto: nunca solo color) ───────────── */
export type Tono = 'exito' | 'aviso' | 'info' | 'neutro' | 'error';
export function Insignia({ etiqueta, tono, icono }: { etiqueta: string; tono: Tono; icono?: NombreIcono }) {
  const t = useTema();
  const { texto: colorTexto, fondo } = t[tono];
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: espacio.xs,
        backgroundColor: fondo,
        borderRadius: radio.pildora,
        paddingVertical: espacio.xs,
        paddingHorizontal: espacio.sm + 2,
      }}
    >
      {icono ? <Icono nombre={icono} tamano="sm" color={colorTexto} /> : null}
      <Text numberOfLines={1} style={{ ...texto.etiqueta, fontSize: 13, color: colorTexto }}>
        {etiqueta}
      </Text>
    </View>
  );
}

/* ───────────── Chip de filtro ───────────── */
export function Chip({ etiqueta, seleccionado, onPress }: { etiqueta: string; seleccionado: boolean; onPress: () => void }) {
  const t = useTema();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: seleccionado }}
      accessibilityLabel={etiqueta}
      onPress={onPress}
      style={(e: EstadoPressable): ViewStyle => ({
        minHeight: 40,
        justifyContent: 'center',
        paddingHorizontal: espacio.md,
        borderRadius: radio.pildora,
        borderWidth: 2,
        borderColor: e.focused ? t.foco : seleccionado ? t.primario : 'rgba(15,23,42,0.10)',
        backgroundColor: seleccionado ? t.primario : e.hovered ? '#FFFFFF' : 'rgba(255,255,255,0.7)',
        ...soloWeb({ transitionProperty: 'background-color, border-color', transitionDuration: '200ms' }),
      })}
    >
      <Text style={{ ...texto.etiqueta, color: seleccionado ? t.sobrePrimario : t.texto }}>{etiqueta}</Text>
    </Pressable>
  );
}

/* ───────────── Estado vacío ───────────── */
export function EstadoVacio({
  icono,
  titulo,
  descripcion,
  accion,
}: {
  icono: NombreIcono;
  titulo: string;
  descripcion: string;
  accion?: ReactNode;
}) {
  const t = useTema();
  return (
    <View
      style={{
        alignItems: 'center',
        gap: espacio.md,
        paddingVertical: espacio.xxl,
        paddingHorizontal: espacio.lg,
        borderRadius: radio.panel,
        borderWidth: 2,
        borderStyle: 'dashed',
        borderColor: 'rgba(15,23,42,0.14)',
        backgroundColor: 'rgba(255,255,255,0.6)',
      }}
    >
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: radio.pildora,
          backgroundColor: t.lima,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icono nombre={icono} tamano="xl" color={t.sobreLima} />
      </View>
      <Texto variante="subtitulo" style={{ textAlign: 'center' }}>
        {titulo}
      </Texto>
      <Texto suave style={{ textAlign: 'center', maxWidth: 420 }}>
        {descripcion}
      </Texto>
      {accion ? <View style={{ flexDirection: 'row', justifyContent: 'center' }}>{accion}</View> : null}
    </View>
  );
}

/* ───────────── Esqueleto de carga (estático: respeta reduce-motion por construcción) ───────────── */
export function Esqueleto({ alto = 16, ancho = '100%' }: { alto?: number; ancho?: ViewStyle['width'] }) {
  const t = useTema();
  return <View style={{ height: alto, width: ancho, borderRadius: radio.sm, backgroundColor: t.superficieAlta }} />;
}

/* ───────────── Marca ───────────── */
export function Marca({ compacta = false }: { sobreOscuro?: boolean; compacta?: boolean }) {
  const t = useTema();
  const lado = compacta ? 32 : 40;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="CotizAI"
      style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.sm + 2 }}
    >
      <View
        style={{
          width: lado,
          height: lado,
          borderRadius: radio.md,
          backgroundColor: t.primario,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Feather name="check-square" size={compacta ? 18 : 22} color={t.lima} />
      </View>
      <Text style={{ fontFamily: fuente.display, fontSize: compacta ? 24 : 28, letterSpacing: -0.9, color: t.texto }}>
        Cotiz<Text style={{ fontFamily: fuente.extra }}>AI</Text>
      </Text>
    </View>
  );
}

/* ───────────── Avatar con iniciales ───────────── */
export function Avatar({ texto: valor }: { texto: string }) {
  const t = useTema();
  return (
    <View
      style={{
        width: 40,
        height: 40,
        borderRadius: radio.pildora,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: 'rgba(15,23,42,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
      }}
    >
      <Text style={{ ...texto.etiqueta, color: t.texto }}>{valor.slice(0, 2).toUpperCase()}</Text>
    </View>
  );
}
