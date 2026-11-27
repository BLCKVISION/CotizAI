import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Texto } from '@/design/componentes';
import { soloWeb } from '@/design/efectos';
import { innerSurface, Panel, RoundButton } from '@/design/Panel';
import { swatch, useTema } from '@/design/tema';
import { espacio, radio } from '@/design/tokens';
import type { Estadisticas } from '@/core/api/management';
import { porEstado, porFormato } from '@/design/chartData';

/** Single-series column chart in the button gradient. The selected column shows its value in a dark tooltip. */
export function SummaryCard({ stats, onOpen }: { stats: Estadisticas; onOpen: () => void }) {
  const t = useTema();
  const [byFormat, setByFormat] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => { setGrown(true); }, 250); // bars rise once the card has entered
    return () => { clearTimeout(id); };
  }, []);
  const data = byFormat ? porFormato(stats) : porEstado(stats);
  const unit = byFormat ? 'propuestas' : 'proyectos';
  const max = Math.max(1, ...data.map((d) => d.valor));
  const peak = data.reduce((best, d, i) => (d.valor > data[best].valor ? i : best), 0);
  const selected = hover ?? (data[peak].valor > 0 ? peak : null);

  return (
    <Panel
      title="Resumen"
      subtitle={byFormat ? 'Propuestas por formato' : 'Proyectos por estado'}
      actions={
        <>
          <RoundButton
            icon="sliders"
            label={byFormat ? 'Ver proyectos por estado' : 'Ver propuestas por formato'}
            onPress={() => {
              setByFormat((v) => !v);
              setHover(null);
            }}
          />
          <RoundButton icon="arrow-up-right" label="Abrir estadísticas" onPress={onOpen} />
        </>
      }
    >
      <View style={{ ...innerSurface, flexDirection: 'row', alignItems: 'stretch', paddingHorizontal: espacio.md, paddingTop: espacio.sm, paddingBottom: espacio.sm, gap: espacio.xs }}>
        {data.map((d, i) => (
          <Pressable key={d.etiqueta} accessibilityLabel={`${d.etiqueta}: ${d.valor} ${unit}`} onHoverIn={() => { setHover(i); }} onHoverOut={() => { setHover(null); }} onPress={() => { setHover(i); }} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
            <View style={{ flex: 1, minHeight: 0, alignSelf: 'stretch', justifyContent: 'flex-end', alignItems: 'center' }}>
              <View style={{ height: 22, justifyContent: 'center', paddingHorizontal: espacio.sm, borderRadius: radio.sm, marginBottom: 4, backgroundColor: selected === i ? t.primario : 'transparent' }}>
                <Texto variante="etiqueta" color={selected === i ? swatch.white : t.textoSuave}>
                  {d.valor}
                </Texto>
              </View>
              <View style={{ flexShrink: 1, width: '100%', maxWidth: 36, height: grown ? `${Math.max(d.valor > 0 ? 8 : 0, (d.valor / max) * 70)}%` : '0%', backgroundColor: t.chart[1], borderTopLeftRadius: 8, borderTopRightRadius: 8, ...soloWeb({ backgroundImage: `linear-gradient(180deg, ${t.chart[0]} 0%, ${t.chart[1]} 50%, ${t.chart[2]} 100%)`, transitionProperty: 'height', transitionDuration: '700ms', transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)' }) }} />
              <View style={{ alignSelf: 'stretch', height: 1, backgroundColor: t.borde }} />
            </View>
            <Texto variante="pequeno" suave numberOfLines={1}>
              {d.etiqueta}
            </Texto>
          </Pressable>
        ))}
      </View>
    </Panel>
  );
}
