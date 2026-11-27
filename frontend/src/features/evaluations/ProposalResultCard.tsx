/** One ranked proposal: verdict, cost comparison, cost steps, score by criterion and findings with their quotes. */
import { View } from 'react-native';

import { Aviso } from '@/design/bloques';
import { CollapsibleCard } from '@/design/Collapsible';
import { Insignia, type NombreIcono, Texto, type Tono } from '@/design/componentes';
import { useTema } from '@/design/tema';
import { espacio, radio } from '@/design/tokens';

import type { ProposalEvaluationItem, ProposalFinding } from './api';
import { CRITERION_LABELS, FINDING_LABELS, formatMoney, type Verdict } from './format';

export const VERDICTS: Record<Verdict, { label: string; tone: Tono; icon: NombreIcono }> = {
  valida: { label: 'Válida', tone: 'exito', icon: 'check-circle' },
  descartada: { label: 'Descartada', tone: 'error', icon: 'x-circle' },
  pendiente_de_revision: { label: 'Pendiente de revisión', tone: 'aviso', icon: 'alert-circle' },
};

export function Bar({ share, label }: { share: number; label: string }) {
  const t = useTema();
  return (
    <View accessibilityLabel={label} style={{ height: 8, borderRadius: radio.pildora, backgroundColor: t.superficieAlta, overflow: 'hidden' }}>
      <View style={{ height: 8, width: `${Math.round(Math.min(1, Math.max(0, share)) * 100)}%`, backgroundColor: t.accentStrong, borderRadius: radio.pildora }} />
    </View>
  );
}

function Section({ title }: { title: string }) {
  return (
    <Texto variante="sobretitulo" suave style={{ marginTop: espacio.sm }}>
      {title.toUpperCase()}
    </Texto>
  );
}

function Finding({ finding }: { finding: ProposalFinding }) {
  const t = useTema();
  return (
    <View style={{ gap: espacio.xs, paddingVertical: espacio.sm, borderTopWidth: 1, borderTopColor: t.borde }}>
      <Insignia
        etiqueta={`${FINDING_LABELS[finding.code] ?? finding.code}${finding.discards ? ' · descarta' : ''}`}
        tono={finding.discards ? 'error' : 'aviso'}
        icono={finding.discards ? 'slash' : 'info'}
      />
      <Texto variante="pequeno">{finding.reason}</Texto>
      {finding.evidence ? (
        <Texto variante="pequeno" suave>
          Cita: «{finding.evidence}»
        </Texto>
      ) : null}
      <Texto variante="pequeno" suave>
        Detectado por {finding.origin === 'ia' ? 'la IA (verifique la cita)' : 'una regla del sistema'}
      </Texto>
    </View>
  );
}

type Props = { item: ProposalEvaluationItem; position: number; costShare: number | null; targetCurrency: string };

export function ProposalResultCard({ item, position, costShare, targetCurrency }: Props) {
  const t = useTema();
  const verdict = VERDICTS[item.verdict];
  const converted = item.converted_cost !== null && item.converted_currency !== item.currency;
  const cost = converted ? formatMoney(item.converted_cost, item.converted_currency) : formatMoney(item.real_cost, item.currency);
  const detail = [verdict.label, item.score !== null ? `${Number(item.score)} pts` : null, cost].filter(Boolean).join(' · ');

  return (
    <CollapsibleCard title={`${position}. ${item.supplier ?? item.filename}`} detail={detail}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.sm }}>
        <Insignia etiqueta={verdict.label} tono={verdict.tone} icono={verdict.icon} />
        {item.over_budget ? <Insignia etiqueta="Supera el presupuesto" tono="aviso" icono="trending-up" /> : null}
      </View>
      <Texto variante="pequeno" suave>
        Archivo: {item.filename}
        {converted ? ` · monto original ${formatMoney(item.real_cost, item.currency)}` : ''}
      </Texto>
      {costShare !== null ? <Bar share={costShare} label={`Costo en ${targetCurrency}: ${cost}`} /> : null}
      {item.supplier_history.map((h) => (
        <Aviso key={h} tono="aviso" texto={`Antecedente del proveedor: ${h}`} />
      ))}

      {item.cost_steps.length > 0 ? (
        <>
          <Section title="Costo real, paso a paso" />
          {item.cost_steps.map((s, i) => (
            <View key={`${s.concept}-${i}`} style={{ flexDirection: 'row', gap: espacio.md, justifyContent: 'space-between' }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Texto variante="pequeno">{s.concept}</Texto>
                <Texto variante="pequeno" suave>
                  {s.detail}
                </Texto>
              </View>
              <Texto variante="etiqueta" color={s.amount === null ? t.aviso.texto : undefined}>
                {formatMoney(s.amount, item.currency)}
              </Texto>
            </View>
          ))}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: t.borde, paddingTop: espacio.xs }}>
            <Texto variante="etiqueta">Costo real</Texto>
            <Texto variante="etiqueta">{formatMoney(item.real_cost, item.currency)}</Texto>
          </View>
        </>
      ) : null}

      {item.criteria.length > 0 ? (
        <>
          <Section title="Puntaje por criterio" />
          {item.criteria.map((c) => {
            const label = `${CRITERION_LABELS[c.criterion] ?? c.criterion}: ${c.score} de 100, peso ${c.weight} %`;
            return (
              <View key={c.criterion} style={{ gap: espacio.xs }}>
                <Texto variante="pequeno">{label}</Texto>
                <Bar share={c.score / 100} label={label} />
                {c.evidence.map((quote) => (
                  <Texto key={quote} variante="pequeno" suave>
                    Cita: «{quote}»
                  </Texto>
                ))}
              </View>
            );
          })}
        </>
      ) : null}

      <Section title={`Hallazgos (${item.findings.length})`} />
      {item.findings.length === 0 ? (
        <Texto variante="pequeno" suave>
          Las reglas automáticas no encontraron observaciones.
        </Texto>
      ) : (
        item.findings.map((f, i) => <Finding key={`${f.code}-${i}`} finding={f} />)
      )}
      {item.reading_warnings.length > 0 ? (
        <>
          <Section title="Avisos de lectura" />
          {item.reading_warnings.map((w, i) => (
            <Texto key={`${w}-${i}`} variante="pequeno" suave>
              {w}
            </Texto>
          ))}
        </>
      ) : null}
    </CollapsibleCard>
  );
}
