/** Exchange rate in force (with source and value date) and the manual fallback for when the BCV is down. */
import { useState } from 'react';
import { View } from 'react-native';

import { Aviso } from '@/design/bloques';
import { Boton, CampoDeTexto, Insignia, Texto } from '@/design/componentes';
import { espacio } from '@/design/tokens';

import type { ExchangeRate, ManualRate } from '../../core/api/evaluations';
import { formatMoney, localDate, parseRate } from '../../core/evaluationFormat';

type Props = {
  rates: ExchangeRate[] | null;
  error: string | null;
  canRegister: boolean;
  onSave: (rate: ManualRate) => Promise<string | null>;
};

export function RatePanel({ rates, error, canRegister, onSave }: Props) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [source, setSource] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // The most recent value date wins, as in the server's conversion.
  const usd = (rates ?? [])
    .filter((r) => r.base === 'USD' && r.quote === 'VES')
    .sort((a, b) => b.effective_date.localeCompare(a.effective_date))[0];
  const parsed = parseRate(value);

  const save = async () => {
    if (!parsed) return;
    setSaving(true);
    const problem = await onSave({ base: 'USD', quote: 'VES', value: parsed, source: source.trim(), effective_date: localDate() });
    setSaving(false);
    setFailure(problem);
    if (!problem) {
      setOpen(false);
      setValue('');
      setSource('');
    }
  };

  return (
    <View style={{ gap: espacio.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: espacio.sm }}>
        <View style={{ gap: espacio.xs, flexShrink: 1 }}>
          {usd ? (
            <>
              <Insignia etiqueta={`1 USD = ${formatMoney(usd.value, 'VES')}`} tono="info" icono="dollar-sign" />
              <Texto variante="pequeno" suave>
                {usd.origin === 'bcv' ? 'BCV' : `Manual: ${usd.source}`} · fecha valor {usd.effective_date}
              </Texto>
            </>
          ) : rates === null ? (
            <Insignia etiqueta="Consultando la tasa" tono="neutro" icono="clock" />
          ) : (
            <Insignia etiqueta="Sin tasa USD vigente" tono="aviso" icono="alert-triangle" />
          )}
        </View>
        {canRegister ? (
          <Boton etiqueta={open ? 'Cancelar' : 'Registrar tasa manual'} variante="secundario" icono={open ? 'x' : 'edit-2'} onPress={() => { setOpen((v) => !v); }} />
        ) : null}
      </View>
      {error && !usd ? <Aviso tono="aviso" texto={error} /> : null}
      {open ? (
        <View style={{ gap: espacio.sm }}>
          <CampoDeTexto etiqueta="Bolívares por 1 USD" value={value} onChangeText={setValue} keyboardType="decimal-pad" placeholder="Ej. 926,36" />
          <CampoDeTexto etiqueta="Fuente documental" value={source} onChangeText={setSource} maxLength={200} placeholder="Ej. Publicación del BCV, captura del día" />
          {failure ? <Aviso texto={failure} /> : null}
          <Boton etiqueta="Guardar tasa" icono="check" cargando={saving} deshabilitado={!parsed || !source.trim()} onPress={() => void save()} />
        </View>
      ) : null}
    </View>
  );
}
