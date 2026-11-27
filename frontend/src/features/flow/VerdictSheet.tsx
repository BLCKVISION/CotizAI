/** Fixed "why yes / why no" template. Every proposal shows the same sections; only the information changes. */
import { View } from 'react-native';

import { Icono, type NombreIcono, Tarjeta, Texto, type Tono } from '@/design/componentes';
import { useTema } from '@/design/tema';
import { espacio, radio } from '@/design/tokens';
import type { ProposalEvaluationItem, ReviewDecision } from '@/features/evaluations/api';
import { CRITERION_LABELS, FINDING_LABELS, formatMoney } from '@/features/evaluations/format';

import { ANSWERS, type CheckState, checklist, mainReasons } from './flow';

export const VERDICT_TONE: Record<ProposalEvaluationItem['verdict'], { tone: Tono; icon: NombreIcono }> = {
  valida: { tone: 'exito', icon: 'check' },
  descartada: { tone: 'error', icon: 'x' },
  pendiente_de_revision: { tone: 'aviso', icon: 'alert-circle' },
};

const CHECK_LOOK: Record<CheckState, { icon: NombreIcono; label: string; tone: Tono }> = {
  yes: { icon: 'check', label: 'Sí', tone: 'exito' },
  no: { icon: 'x', label: 'No', tone: 'error' },
  doubt: { icon: 'alert-circle', label: 'Revisar', tone: 'aviso' },
  unchecked: { icon: 'minus', label: 'Sin verificar', tone: 'neutro' },
};

function SectionTitle({ children }: { children: string }) {
  return (
    <Texto variante="sobretitulo" suave accessibilityRole="header">
      {children.toUpperCase()}
    </Texto>
  );
}

export function VerdictSheet({ item, decision }: { item: ProposalEvaluationItem; decision: ReviewDecision | undefined }) {
  const t = useTema();
  const answer = ANSWERS[item.verdict];
  const look = VERDICT_TONE[item.verdict];
  const tone = t[look.tone];
  const reasons = mainReasons(item);
  const cost = item.converted_cost !== null ? formatMoney(item.converted_cost, item.converted_currency) : item.real_cost !== null ? formatMoney(item.real_cost, item.currency) : 'No determinado';

  return (
    <Tarjeta>
      {/* 1. The answer */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.md, padding: espacio.md, borderRadius: radio.xl, backgroundColor: tone.fondo }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' }}>
          <Texto variante="subtitulo" color={tone.texto} style={{ fontFamily: 'Urbanist_700Bold', fontSize: 22, lineHeight: 28 }}>
            {answer.short}
          </Texto>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Texto variante="subtitulo" color={tone.texto} accessibilityRole="header" style={{ fontFamily: 'Urbanist_600SemiBold' }}>
            {answer.headline}
          </Texto>
          <Texto variante="etiqueta" numberOfLines={1}>
            {item.supplier ?? item.filename}
          </Texto>
          <Texto variante="pequeno" suave numberOfLines={1}>
            {item.filename} · costo real: {cost}
            {item.score !== null ? ` · ${Number(item.score)} de 100` : ''}
            {item.over_budget ? ' · supera el presupuesto' : ''}
          </Texto>
        </View>
      </View>
      {decision ? (
        <View style={{ flexDirection: 'row', gap: espacio.sm, alignItems: 'center', padding: espacio.sm + 4, borderRadius: radio.lg, backgroundColor: t.superficieAlta }}>
          <Icono nombre="user-check" tamano="sm" />
          <Texto variante="pequeno" style={{ flex: 1 }}>
            Verificado por {decision.decided_by}: {decision.approved ? 'SÍ, aprobada' : 'NO, rechazada'}
            {decision.comment ? ` · «${decision.comment}»` : ''}
          </Texto>
        </View>
      ) : null}

      {/* 2. Why */}
      <SectionTitle>{answer.why}</SectionTitle>
      {item.verdict === 'valida' && item.criteria.length > 0
        ? item.criteria.map((c) => (
            <View key={c.criterion} style={{ gap: 2 }}>
              <Texto variante="etiqueta">
                {CRITERION_LABELS[c.criterion] ?? c.criterion}: {c.score} de 100 (pesa {c.weight} %)
              </Texto>
              {c.evidence.slice(0, 2).map((quote) => (
                <Texto key={quote} variante="pequeno" suave>
                  «{quote}»
                </Texto>
              ))}
            </View>
          ))
        : null}
      {reasons.map((r, i) => (
        <View key={`${r.code}-${i}`} style={{ gap: 2, paddingLeft: espacio.sm + 4, borderLeftWidth: 3, borderLeftColor: r.discards ? t.error.texto : t.aviso.texto }}>
          <Texto variante="etiqueta">
            {FINDING_LABELS[r.code] ?? r.code}: {r.reason}
          </Texto>
          {r.evidence ? (
            <Texto variante="pequeno" suave numberOfLines={3}>
              Cita del documento: «{r.evidence}»
            </Texto>
          ) : null}
          <Texto variante="pequeno" suave>
            Detectado por {r.origin === 'ia' ? 'la IA: verifique la cita' : 'una regla del sistema'}
          </Texto>
        </View>
      ))}
      {reasons.length === 0 && item.criteria.length === 0 ? <Texto suave>No hay observaciones registradas.</Texto> : null}

      {/* 3. The same questions for everyone */}
      <SectionTitle>Preguntas de control</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: espacio.md }}>
        {checklist(item).map((c) => {
          const state = CHECK_LOOK[c.state];
          return (
            <View key={c.code} accessible accessibilityLabel={`${c.question} ${state.label}`} style={{ flexGrow: 1, flexBasis: 280, flexDirection: 'row', alignItems: 'center', gap: espacio.sm, minHeight: 36 }}>
              <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: t[state.tone].fondo }}>
                <Icono nombre={state.icon} tamano="sm" color={t[state.tone].texto} />
              </View>
              <Texto variante="pequeno" style={{ flex: 1 }}>
                {c.question}
              </Texto>
              <Texto variante="etiqueta" color={t[state.tone].texto}>
                {state.label}
              </Texto>
            </View>
          );
        })}
      </View>

      {/* 4. How the real cost is reached */}
      {item.cost_steps.length > 0 ? (
        <>
          <SectionTitle>Costo real, paso a paso</SectionTitle>
          {item.cost_steps.map((s, i) => (
            <View key={`${s.concept}-${i}`} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: espacio.md, paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: t.borde }}>
              <Texto variante="pequeno" style={{ flex: 1 }}>
                {s.concept}
                {s.detail ? ` · ${s.detail}` : ''}
              </Texto>
              <Texto variante="etiqueta">{s.amount === null ? 'No determinado' : formatMoney(s.amount, item.currency)}</Texto>
            </View>
          ))}
        </>
      ) : null}
      {item.supplier_history.map((h) => (
        <Texto key={h} variante="pequeno" color={t.aviso.texto}>
          Antecedente del proveedor: {h}
        </Texto>
      ))}
      {item.reading_warnings.length > 0 ? (
        <Texto variante="pequeno" suave>
          Avisos de lectura: {item.reading_warnings.join(' · ')}
        </Texto>
      ) : null}
    </Tarjeta>
  );
}
