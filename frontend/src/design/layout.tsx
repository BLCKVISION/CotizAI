import { type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { Icono, type NombreIcono, Texto } from './componentes';
import { useDispositivo } from './dispositivo';
import { Escalonado, useContador, vidrio } from './efectos';
import { useTema } from './tema';
import { anchoMaximoContenido, espacio, radio } from './tokens';

/** Contenedor de página: gutters adaptativos, ancho máximo, scroll y entrada escalonada de sus bloques. */
export function Pagina({ children }: { children: ReactNode }) {
  const { dispositivo } = useDispositivo();
  const gutter = dispositivo === 'movil' ? espacio.md : espacio.xl;
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ flexGrow: 1, alignItems: 'center', paddingBottom: espacio.xxxl }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ width: '100%', maxWidth: anchoMaximoContenido, paddingHorizontal: gutter, paddingTop: espacio.xl, gap: espacio.xl }}>
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
        <Texto variante={dispositivo === 'movil' ? 'subtitulo' : 'titulo'} accessibilityRole="header" style={{ color: t.texto }}>
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

/** Tarjeta de métrica: cifra display ligera que cuenta hasta su valor, etiqueta e icono en disco blanco. */
export function Metrica({ etiqueta, valor, icono }: { etiqueta: string; valor: number; icono: NombreIcono }) {
  const t = useTema();
  const mostrado = useContador(valor);
  return (
    <View
      accessible
      accessibilityLabel={`${etiqueta}: ${valor}`}
      style={{
        ...vidrio({ radio: radio.xl }),
        flexGrow: 1,
        flexBasis: 170,
        padding: espacio.lg,
        gap: espacio.sm,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Texto variante="etiqueta" suave>
          {etiqueta}
        </Texto>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: radio.pildora,
            backgroundColor: '#FFFFFF',
            borderWidth: 1,
            borderColor: 'rgba(15,23,42,0.08)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icono nombre={icono} color={t.texto} />
        </View>
      </View>
      <Texto variante="metrica">{mostrado}</Texto>
    </View>
  );
}
