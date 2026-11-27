/** Step 3: choose which proposals the AI reads. */
import { Pressable, View } from 'react-native';

import { Aviso } from '@/design/bloques';
import { Chip, Icono, Insignia, Tarjeta, Texto } from '@/design/componentes';
import { useTema } from '@/design/tema';
import { espacio, radio } from '@/design/tokens';
import { showToast } from '@/design/toastStore';
import type { Propuesta } from '@/features/gestion/api';

import { MAX_PER_RUN } from './flow';

type PressState = { pressed: boolean; hovered?: boolean; focused?: boolean };

type Props = {
  proposals: Propuesta[];
  selected: Set<string>;
  evaluated: Set<string>;
  onChange: (next: Set<string>) => void;
};

export function AnalysisStep({ proposals, selected, evaluated, onChange }: Props) {
  const t = useTema();
  const fresh = proposals.filter((p) => !evaluated.has(p.id));
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (!next.delete(id)) {
      if (next.size >= MAX_PER_RUN) return showToast({ tone: 'info', title: `Máximo ${MAX_PER_RUN} por tanda`, detail: 'Quite una para elegir otra' });
      next.add(id);
    }
    onChange(next);
  };
  const batch = (list: Propuesta[]) => new Set(list.slice(0, MAX_PER_RUN).map((p) => p.id));
  const isBatch = (list: Propuesta[]) => {
    const wanted = batch(list);
    return wanted.size === selected.size && [...wanted].every((id) => selected.has(id));
  };
  return (
    <Tarjeta>
      <Texto variante="subtitulo" accessibilityRole="header">
        ¿Cuáles propuestas va a evaluar?
      </Texto>
      <Texto suave>La IA lee cada documento, revisa las cuentas y las condiciones, y le explica por qué sí o por qué no.</Texto>
      <Texto variante="etiqueta">
        {selected.size} de {MAX_PER_RUN} posibles en esta tanda
        {fresh.length > 0 && evaluated.size > 0 ? ` · ${fresh.length} sin analizar` : ''}
      </Texto>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.sm }}>
        <Chip etiqueta={proposals.length > MAX_PER_RUN ? `Primeras ${MAX_PER_RUN}` : 'Todas'} seleccionado={isBatch(proposals)} onPress={() => onChange(batch(proposals))} />
        {evaluated.size > 0 && fresh.length > 0 ? (
          <Chip etiqueta={`Sin analizar (${Math.min(fresh.length, MAX_PER_RUN)})`} seleccionado={isBatch(fresh)} onPress={() => onChange(batch(fresh))} />
        ) : null}
        <Chip etiqueta="Ninguna" seleccionado={selected.size === 0} onPress={() => onChange(new Set())} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.sm }}>
        {proposals.map((p) => {
          const on = selected.has(p.id);
          return (
            <Pressable
              key={p.id}
              accessibilityRole="checkbox"
              accessibilityLabel={p.archivo}
              accessibilityState={{ checked: on }}
              aria-checked={on}
              onPress={() => toggle(p.id)}
              style={(e: PressState) => ({ flexGrow: 1, flexBasis: 300, flexDirection: 'row', alignItems: 'center', gap: espacio.sm + 2, padding: espacio.sm + 4, borderRadius: radio.lg, borderWidth: 2, borderColor: e.focused ? t.foco : on ? t.accentStrong : t.borde, backgroundColor: on ? '#F0FBFE' : e.hovered ? t.superficieAlta : '#FFFFFF' })}
            >
              <View style={{ width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: on ? 0 : 2, borderColor: t.bordeControl, backgroundColor: on ? t.accent : 'transparent' }}>
                {on ? <Icono nombre="check" tamano="sm" color={t.onAccent} /> : null}
              </View>
              <Texto variante="etiqueta" numberOfLines={1} style={{ flex: 1 }}>
                {p.archivo}
              </Texto>
              {evaluated.has(p.id) ? <Insignia etiqueta="Ya evaluada" tono="neutro" /> : evaluated.size > 0 ? <Insignia etiqueta="Nueva" tono="info" /> : null}
            </Pressable>
          );
        })}
      </View>
      {evaluated.size > 0 ? <Aviso tono="info" texto="Las que no elija conservan su resultado. Las que vuelva a evaluar tendrá que verificarlas otra vez." /> : null}
    </Tarjeta>
  );
}
