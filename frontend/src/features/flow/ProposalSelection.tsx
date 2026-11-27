/** Choosing which proposals the AI reads: quick-pick chips and a checkbox for each row of the proposal list. */
import { Pressable, View } from 'react-native';

import { Aviso } from '@/design/bloques';
import { Chip, Icono, Insignia, Texto } from '@/design/componentes';
import { useTema } from '@/design/tema';
import { espacio } from '@/design/tokens';
import { showToast } from '@/design/toastStore';
import type { Propuesta } from '@/features/gestion/api';

import { MAX_PER_RUN } from './flow';

type PressState = { pressed: boolean; hovered?: boolean; focused?: boolean };

export type Selection = {
  selected: Set<string>;
  evaluated: Set<string>;
  onChange: (next: Set<string>) => void;
};

const batch = (list: Propuesta[]) => new Set(list.slice(0, MAX_PER_RUN).map((p) => p.id));

export function toggleSelection({ selected, onChange }: Selection, id: string) {
  const next = new Set(selected);
  if (!next.delete(id)) {
    if (next.size >= MAX_PER_RUN) return showToast({ tone: 'info', title: `Máximo ${MAX_PER_RUN} por tanda`, detail: 'Quite una para elegir otra' });
    next.add(id);
  }
  onChange(next);
}

/** Round checkbox that sits at the start of a proposal row. */
export function SelectBox({ proposal, selection }: { proposal: Propuesta; selection: Selection }) {
  const t = useTema();
  const on = selection.selected.has(proposal.id);
  const { evaluated } = selection;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.sm }}>
      {evaluated.has(proposal.id) ? <Insignia etiqueta="Ya evaluada" tono="neutro" /> : evaluated.size > 0 ? <Insignia etiqueta="Nueva" tono="info" /> : null}
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={`Evaluar ${proposal.archivo}`}
        accessibilityState={{ checked: on }}
        aria-checked={on}
        hitSlop={8}
        onPress={() => toggleSelection(selection, proposal.id)}
        style={(e: PressState) => ({ width: 26, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center', borderWidth: on ? 2 : 2, borderColor: e.focused ? t.foco : on ? t.accent : t.bordeControl, backgroundColor: on ? t.accent : 'transparent' })}
      >
        {on ? <Icono nombre="check" tamano="sm" color={t.onAccent} /> : null}
      </Pressable>
    </View>
  );
}

export function SelectionChips({ proposals, selection }: { proposals: Propuesta[]; selection: Selection }) {
  const { selected, evaluated, onChange } = selection;
  const fresh = proposals.filter((p) => !evaluated.has(p.id));
  const isBatch = (list: Propuesta[]) => {
    const wanted = batch(list);
    return wanted.size === selected.size && [...wanted].every((id) => selected.has(id));
  };
  return (
    <View style={{ gap: espacio.sm }}>
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
      {evaluated.size > 0 ? <Aviso tono="info" texto="Las que no elija conservan su resultado. Las que vuelva a evaluar tendrá que verificarlas otra vez." /> : null}
    </View>
  );
}
