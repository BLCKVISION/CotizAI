/**
 * Gráficos de una sola serie (magnitud): un solo tono, valor rotulado, detalle al pasar el cursor o tocar
 * y vista de tabla. Sin leyenda porque el título nombra la serie. Con un solo eje.
 */
import { useState } from 'react';
import { Pressable, type PressableStateCallbackType, View } from 'react-native';

import { Chip, Tarjeta, Texto } from './componentes';
import { TituloDeSeccion } from './bloques';
import { useTema } from './tema';
import { espacio, radio } from './tokens';

export type Dato = { etiqueta: string; valor: number };
type Estado = PressableStateCallbackType & { hovered?: boolean; focused?: boolean };
const TONO = '#2563EB';

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
  const detalle = sel ? `${sel.etiqueta}: ${sel.valor} ${unidad} (${Math.round((sel.valor / Math.max(1, total)) * 100)} %)` : `${total} ${unidad} en total`;
  const eventos = (i: number) => ({ onHoverIn: () => setActivo(i), onHoverOut: () => setActivo(null), onPress: () => setActivo(i) });

  return (
    <Tarjeta style={{ flex: 1 }}>
      <TituloDeSeccion
        titulo={titulo}
        detalle={total > 0 ? detalle : undefined}
        accion={total > 0 ? <Chip etiqueta={tabla ? 'Ver gráfico' : 'Ver tabla'} seleccionado={false} onPress={() => setTabla((v) => !v)} /> : undefined}
      />
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
                <View style={{ height: 10, width: `${(d.valor / maximo) * 100}%`, backgroundColor: TONO, borderTopRightRadius: 4, borderBottomRightRadius: 4 }} />
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
              <View style={{ width: '100%', maxWidth: 44, height: (d.valor / maximo) * 120, backgroundColor: TONO, borderTopLeftRadius: 4, borderTopRightRadius: 4 }} />
              <View style={{ alignSelf: 'stretch', height: 1, backgroundColor: t.borde }} />
              <Texto variante="pequeno" suave numberOfLines={1}>
                {d.etiqueta}
              </Texto>
            </Pressable>
          ))}
        </View>
      )}
    </Tarjeta>
  );
}
