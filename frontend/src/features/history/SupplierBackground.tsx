/** A supplier's record and what happened to it in earlier evaluations of this organisation. */
import { View } from 'react-native';

import { Aviso, Fila } from '@/design/bloques';
import { Insignia, Texto, type Tono } from '@/design/componentes';
import { useTema } from '@/design/tema';
import { espacio, radio } from '@/design/tokens';
import { FINDING_LABELS, formatMoney } from '@/features/evaluations/format';
import { formatoFecha } from '@/features/proyectos/estados';

import { alertText, type Participation, type SupplierEntry } from './suppliers';

const VERDICTS: Record<string, { label: string; tone: Tono }> = {
  valida: { label: 'Válida', tone: 'exito' },
  descartada: { label: 'Descartada', tone: 'aviso' },
  pendiente_de_revision: { label: 'Pendiente de revisión', tone: 'neutro' },
};

function ParticipationCard({ item }: { item: Participation }) {
  const t = useTema();
  const verdict = VERDICTS[item.verdict] ?? { label: item.verdict, tone: 'neutro' as Tono };
  return (
    <View style={{ gap: espacio.xs, borderWidth: 1, borderColor: t.borde, borderRadius: radio.lg, padding: espacio.md }}>
      <Texto variante="cuerpoMedio">{item.project_name}</Texto>
      <Insignia etiqueta={verdict.label} tono={verdict.tone} />
      <Texto variante="pequeno" suave>
        {`${formatoFecha(item.evaluated_at)} · puesto ${item.position} de ${item.competitors} · costo real ${formatMoney(item.cost, item.currency)}`}
      </Texto>
      <Texto variante="pequeno" suave>
        {item.filename}
      </Texto>
      {item.causes.map((c, i) => (
        <Texto key={`${c.code}-${i}`} variante="pequeno">
          {`${FINDING_LABELS[c.code] ?? c.code}: ${c.reason}`}
        </Texto>
      ))}
    </View>
  );
}

export function SupplierBackground({ supplier, restricted }: { supplier: SupplierEntry; restricted: boolean }) {
  const record = supplier.registration;
  return (
    <View style={{ gap: espacio.md }}>
      {supplier.alerts.length > 0 ? (
        <Aviso tono="aviso" texto={`Descartado antes por: ${supplier.alerts.map(alertText).join(', ')}.`} />
      ) : null}
      {record ? (
        <View>
          <Fila icono="hash" titulo="RIF" detalle={record.tax_id} />
          <Fila icono="map-pin" titulo="Ubicación" detalle={record.location} />
          <Fila icono="phone" titulo="Contacto" detalle={record.contact} />
        </View>
      ) : (
        <Aviso tono="info" texto="Se detectó en una cotización evaluada. Todavía no tiene ficha con RIF, ubicación y contacto." />
      )}
      <Texto variante="sobretitulo" suave>
        ANTECEDENTES
      </Texto>
      {restricted ? (
        <Texto suave>Su rol no permite ver los resultados de las evaluaciones.</Texto>
      ) : supplier.participations.length === 0 ? (
        <Texto suave>Todavía no aparece en ninguna evaluación.</Texto>
      ) : (
        supplier.participations.map((p) => <ParticipationCard key={`${p.project_id}-${p.filename}`} item={p} />)
      )}
    </View>
  );
}
