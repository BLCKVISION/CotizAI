/**
 * Gráficos de una sola serie (magnitud): un solo tono, valor rotulado, detalle al pasar el cursor o tocar
 * y vista de tabla. Sin leyenda porque el título nombra la serie. Con un solo eje.
 */
import { useState } from 'react';
import { Pressable, type PressableStateCallbackType, ScrollView, View } from 'react-native';

import { Chip, Texto } from './componentes';
import { soloWeb, vidrio } from './efectos';
import { paletaClara, useTema } from './tema';
import { espacio, radio } from './tokens';

const CHART_CARD_HEIGHT = 372;
export type Dato = { etiqueta: string; valor: number };
type Estado = PressableStateCallbackType & { hovered?: boolean; focused?: boolean };
const [SKY, AQUA, MINT] = paletaClara.chart;
const TONO = AQUA; // solid fallback where gradients are not available
/** Same gradient as the buttons: left→right for bars, top→bottom for columns. */
const fill = (angle: number) => soloWeb({ backgroundImage: `linear-gradient(${angle}deg, ${SKY} 0%, ${AQUA} 50%, ${MINT} 100%)` });

export function TarjetaDeGrafico({
  titulo,
  unidad,
  datos,
  forma = 'barras',
  vacio = 'Aún no hay datos.',
}: {
  titulo: string;
  unidad: string;
  datos: Dato[];
  forma?: 'barras' | 'columnas';
  vacio?: string;
}) {
  const t = useTema();
  const [tabla, setTabla] = useState(false);
  const [activo, setActivo] = useState<number | null>(null);
  const total = datos.reduce((s, d) => s + d.valor, 0);
  const maximo = Math.max(1, ...datos.map((d) => d.valor));
  const sel = activo === null ? null : datos[activo];
  const detalle = sel ? `${sel.etiqueta}: ${sel.valor} ${unidad} (${Math.round((sel.valor / Math.max(1, total)) * 100)} %)` : `${total} ${total === 1 ? unidad.replace(/s$/, '') : unidad} en total`;
  const eventos = (i: number) => ({ onHoverIn: () => { setActivo(i); }, onHoverOut: () => { setActivo(null); }, onPress: () => { setActivo(i); } });

  return (
    // Fixed height so every chart card in a grid looks the same; long lists scroll inside.
    <View style={{ ...vidrio({ radio: radio.xl }), height: CHART_CARD_HEIGHT, padding: espacio.lg, gap: espacio.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: espacio.sm }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Texto variante="cuerpoMedio" accessibilityRole="header" numberOfLines={1} style={{ fontFamily: 'Urbanist_600SemiBold' }}>
            {titulo}
          </Texto>
          <Texto variante="pequeno" suave numberOfLines={1}>
            {total > 0 ? detalle : vacio}
          </Texto>
        </View>
        {total > 0 ? <Chip etiqueta={tabla ? 'Ver gráfico' : 'Ver tabla'} seleccionado={false} onPress={() => { setTabla((v) => !v); }} /> : null}
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, justifyContent: forma === 'columnas' && !tabla ? 'flex-end' : 'flex-start' }}>
      {total === 0 ? (
        <Texto suave style={{ paddingVertical: espacio.lg }}>
          {vacio}
        </Texto>
      ) : tabla ? (
        <View>
          {datos.map((d) => (
            <View key={d.etiqueta} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: espacio.md, paddingVertical: espacio.sm, borderBottomWidth: 1, borderBottomColor: t.borde }}>
              <Texto variante="pequeno" style={{ flex: 1 }}>
                {d.etiqueta}
              </Texto>
              <Texto variante="etiqueta">{d.valor}</Texto>
            </View>
          ))}
        </View>
      ) : forma === 'barras' ? (
        <View style={{ gap: espacio.xs }}>
          {datos.map((d, i) => (
            <Pressable key={d.etiqueta} accessibilityLabel={`${d.etiqueta}: ${d.valor} ${unidad}`} {...eventos(i)}
              style={(e: Estado) => ({ paddingVertical: espacio.xs + 2, paddingHorizontal: espacio.xs, borderRadius: radio.sm, gap: espacio.xs, borderWidth: 1, borderColor: e.focused ? t.foco : 'transparent', backgroundColor: activo === i ? t.superficieAlta : 'transparent' })}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: espacio.sm }}>
                <Texto variante="pequeno" numberOfLines={1} style={{ flex: 1 }}>
                  {d.etiqueta}
                </Texto>
                <Texto variante="etiqueta">{d.valor}</Texto>
              </View>
              <View style={{ height: 10 }}>
                <View style={{ height: 10, width: `${(d.valor / maximo) * 100}%`, backgroundColor: TONO, borderTopRightRadius: 5, borderBottomRightRadius: 5, ...fill(90) }} />
              </View>
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 190, paddingTop: espacio.md }}>
          {datos.map((d, i) => (
            <Pressable key={d.etiqueta} accessibilityLabel={`${d.etiqueta}: ${d.valor} ${unidad}`} {...eventos(i)}
              style={{ flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center', gap: espacio.xs, backgroundColor: activo === i ? t.superficieAlta : 'transparent', borderRadius: radio.sm }}>
              <Texto variante="etiqueta">{d.valor}</Texto>
              <View style={{ width: '100%', maxWidth: 44, height: (d.valor / maximo) * 120, backgroundColor: TONO, borderTopLeftRadius: 8, borderTopRightRadius: 8, ...fill(180) }} />
              <View style={{ alignSelf: 'stretch', height: 1, backgroundColor: t.borde }} />
              <Texto variante="pequeno" suave numberOfLines={1}>
                {d.etiqueta}
              </Texto>
            </Pressable>
          ))}
        </View>
      )}
      </ScrollView>
    </View>
  );
}
