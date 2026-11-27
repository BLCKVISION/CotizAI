import { type ReactNode } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';

import { Icono, type NombreIcono, Texto } from './componentes';
import { useDispositivo } from './dispositivo';
import { Escalonado, soloWeb, useContador, vidrio } from './efectos';
import { swatch, tint, useTema } from './tema';
import { anchoMaximoContenido, espacio, radio } from './tokens';

/** Contenedor de página: gutters adaptativos, ancho máximo, scroll y entrada escalonada de sus bloques. */
export function Pagina({ children }: { children: ReactNode }) {
  const { dispositivo } = useDispositivo();
  const { height } = useWindowDimensions();
  const gutter = dispositivo === 'movil' ? espacio.md : height < 860 ? espacio.lg : espacio.xl;
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ flexGrow: 1, alignItems: 'center', paddingBottom: espacio.xxxl }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ width: '100%', maxWidth: anchoMaximoContenido, paddingHorizontal: gutter, paddingTop: espacio.sm, gap: espacio.lg }}>
        <Escalonado>{children}</Escalonado>
      </View>
    </ScrollView>
  );
}

/** Encabezado estilo Relay: migas «CotizAI / Sección», título display ligero y subtítulo suave. */
export function EncabezadoDePagina({
  sobretitulo,
  titulo,
  descripcion,
  accion,
}: {
  sobretitulo?: string;
  titulo: string;
  descripcion?: string;
  accion?: ReactNode;
}) {
  const { dispositivo } = useDispositivo();
  const t = useTema();
  return (
    <View
      style={{
        flexDirection: dispositivo === 'movil' ? 'column' : 'row',
        alignItems: dispositivo === 'movil' ? 'stretch' : 'flex-end',
        justifyContent: 'space-between',
        gap: espacio.md,
      }}
    >
      <View style={{ gap: espacio.sm, flexShrink: 1 }}>
        {sobretitulo ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.sm }}>
            <Texto variante="pequeno" suave>
              CotizAI
            </Texto>
            <Texto variante="pequeno" suave>
              /
            </Texto>
            <Texto variante="etiqueta">{sobretitulo}</Texto>
          </View>
        ) : null}
        <Texto variante={dispositivo === 'movil' ? 'subtitulo' : 'titulo'} accessibilityRole="header" style={{ color: t.texto, fontFamily: 'Urbanist_600SemiBold' }}>
          {titulo}
        </Texto>
        {descripcion ? (
          <Texto suave style={{ maxWidth: 640 }}>
            {descripcion}
          </Texto>
        ) : null}
      </View>
      {accion}
    </View>
  );
}

/** Blue frosted glass: translucent gradient, bright edge and soft light spots behind the content. */
const BLUE_GLASS = {
  backgroundColor: tint.skyDeep(0.55),
  borderColor: tint.white(0.85),
  ...soloWeb({
    backgroundImage: `linear-gradient(135deg, ${tint.azure(0.78)} 0%, ${tint.sky(0.58)} 55%, ${tint.ice(0.72)} 100%)`,
    backdropFilter: 'blur(26px) saturate(1.5)',
    WebkitBackdropFilter: 'blur(26px) saturate(1.5)',
    boxShadow: `0 20px 40px -24px ${tint.blue(0.55)}, inset 0 1px 0 ${tint.white(0.9)}, inset 0 0 28px ${tint.white(0.35)}`,
  }),
};

function GlassLights() {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', width: 150, height: 150, borderRadius: 75, top: -70, right: -30, backgroundColor: tint.white(0.45), ...soloWeb({ filter: 'blur(18px)' }) }} />
      <View style={{ position: 'absolute', width: 120, height: 120, borderRadius: 60, bottom: -70, left: '30%', backgroundColor: tint.blue(0.28), ...soloWeb({ filter: 'blur(22px)' }) }} />
    </View>
  );
}

/** Tarjeta de métrica: cifra display ligera que cuenta hasta su valor, etiqueta e icono en disco blanco. */
export function Metrica({ etiqueta, valor, icono, destacada = false }: { etiqueta: string; valor: number; icono: NombreIcono; destacada?: boolean }) {
  const t = useTema();
  const mostrado = useContador(valor);
  return (
    <View
      accessible
      accessibilityLabel={`${etiqueta}: ${valor}`}
      style={{
        ...vidrio({ radio: radio.xl }),
        ...(destacada ? BLUE_GLASS : null),
        overflow: 'hidden',
        flexGrow: 1,
        flexBasis: 170,
        padding: espacio.lg,
        gap: espacio.sm,
      }}
    >
      {destacada ? <GlassLights /> : null}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Texto variante="etiqueta" suave={!destacada} color={destacada ? t.onAccent : undefined}>
          {etiqueta}
        </Texto>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: radio.pildora,
            backgroundColor: destacada ? tint.white(0.72) : swatch.white,
            borderWidth: 1,
            borderColor: destacada ? swatch.white : tint.navy(0.08),
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icono nombre={icono} color={t.texto} />
        </View>
      </View>
      <Texto variante="metrica" color={destacada ? t.onAccent : undefined}>{mostrado}</Texto>
    </View>
  );
}

/**
 * Viewport-height page (desktop/tablet): no outer scroll, children share the height and long content
 * scrolls inside its own panel. On phones it falls back to a normal scrolling page.
 */
export function FixedPage({ children }: { children: ReactNode }) {
  const { dispositivo } = useDispositivo();
  const { height } = useWindowDimensions();
  const compact = height < 860;
  if (dispositivo === 'movil') return <Pagina>{children}</Pagina>;
  return (
    <View style={{ flex: 1, alignItems: 'center', overflow: 'hidden' }}>
      <View style={{ flex: 1, width: '100%', maxWidth: anchoMaximoContenido, paddingHorizontal: compact ? espacio.lg : espacio.xl, paddingTop: espacio.sm, paddingBottom: compact ? 20 : espacio.xl, gap: compact ? 20 : espacio.xl, minHeight: 0 }}>
        {children}
      </View>
    </View>
  );
}
