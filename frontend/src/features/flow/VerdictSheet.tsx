/** The evaluation in plain words. Every proposal shows the same sections; only the information changes. */
import { View } from 'react-native';

import { Icono, type NombreIcono, Texto, type Tono } from '@/design/componentes';
import { CollapsibleCard } from '@/design/Collapsible';
import { Entrada } from '@/design/efectos';
import { useTema } from '@/design/tema';
import { espacio, radio } from '@/design/tokens';
import type { ProposalEvaluationItem, ReviewDecision } from '@/features/evaluations/api';
import { CRITERION_LABELS, formatMoney } from '@/features/evaluations/format';

import { ANSWERS, type CheckState, checklist, type Issue, issues } from './flow';

// "Does not meet the requirements" is an outcome, not a system error: warm amber, never red.
export const VERDICT_TONE: Record<ProposalEvaluationItem['verdict'], { tone: Tono; icon: NombreIcono }> = {
  valida: { tone: 'exito', icon: 'check' },
  descartada: { tone: 'aviso', icon: 'alert-circle' },
  pendiente_de_revision: { tone: 'info', icon: 'help-circle' },
};

const CHECK_LOOK: Record<CheckState, { icon: NombreIcono; label: string; tone: Tono }> = {
  yes: { icon: 'check', label: 'Cumple', tone: 'exito' },
  no: { icon: 'alert-circle', label: 'No cumple', tone: 'aviso' },
  doubt: { icon: 'help-circle', label: 'Por confirmar', tone: 'info' },
  unchecked: { icon: 'minus', label: 'Sin verificar', tone: 'neutro' },
};

const ISSUE_ICONS: Record<string, NombreIcono> = {
  ALCANCE: 'list', COMPAT: 'cpu', CAPACIDAD: 'zap', CALIDAD: 'award', ABUSIVO: 'dollar-sign', ARITMETICA: 'percent', MANIPULACION: 'eye-off', LECTURA: 'help-circle',
};

function SectionTitle({ children }: { children: string }) {
  return (
    <Texto variante="subtitulo" accessibilityRole="header" style={{ fontFamily: 'Urbanist_600SemiBold' }}>
      {children}
    </Texto>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  const t = useTema();
  return (
    <View style={{ flexGrow: 1, flexBasis: 130, gap: 2, padding: espacio.md, borderRadius: radio.lg, borderWidth: 1, borderColor: t.borde, backgroundColor: '#FFFFFF' }}>
      <Texto variante="pequeno" suave>{label}</Texto>
      <Texto variante="cuerpoMedio" color={tone} numberOfLines={2} style={{ fontFamily: 'Urbanist_700Bold' }}>{value}</Texto>
    </View>
  );
}

function IssueCard({ issue }: { issue: Issue }) {
  const t = useTema();
  return (
    <View style={{ gap: espacio.sm, padding: espacio.md, borderRadius: radio.lg, borderWidth: 1, borderColor: t.borde, backgroundColor: '#FFFFFF' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.sm + 4 }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: t.superficieAlta }}>
          <Icono nombre={ISSUE_ICONS[issue.code] ?? 'info'} tamano="sm" />
        </View>
        <Texto variante="cuerpoMedio" style={{ flex: 1, fontFamily: 'Urbanist_600SemiBold' }}>
          {issue.title}
        </Texto>
      </View>
      {issue.meaning ? <Texto>{issue.meaning}</Texto> : null}
      {issue.points.map((p) => (
        <Texto key={p}>• {p}</Texto>
      ))}
      {issue.quotes.map((q) => (
        <View key={q} style={{ padding: espacio.sm + 2, borderRadius: radio.md, backgroundColor: t.superficieAlta, gap: 2 }}>
          <Texto variante="pequeno" suave>
            En el documento{issue.byAi ? ' (señalado por la IA: confirme la cita)' : ''}
          </Texto>
          <Texto variante="pequeno" numberOfLines={3}>
            «{q}»
          </Texto>
        </View>
      ))}
    </View>
  );
}

const TRACE_LOOK = {
  ok: { icon: 'check', tone: 'exito' },
  alert: { icon: 'x', tone: 'error' },
  info: { icon: 'info', tone: 'info' },
} as const;

/** The agent's audit trail: each step that ran, what it found and how the verdict was reached. */
function DecisionTrace({ steps }: { steps: NonNullable<ProposalEvaluationItem['trace']> }) {
  const t = useTema();
  return (
    <CollapsibleCard title="Cómo se decidió, paso a paso" detail={`${steps.length} pasos registrados del agente`}>
      {steps.map((step, i) => {
        const look = TRACE_LOOK[step.status] ?? TRACE_LOOK.info;
        const last = i === steps.length - 1;
        return (
          <Entrada key={`${step.step}-${i}`} indice={Math.min(i, 10)}>
            <View accessible accessibilityLabel={`Paso ${i + 1}: ${step.title}. ${step.detail.join('. ')}`} style={{ flexDirection: 'row', gap: espacio.sm + 4 }}>
              <View style={{ alignItems: 'center' }}>
                <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: t[look.tone].fondo }}>
                  <Icono nombre={look.icon} tamano="sm" color={t[look.tone].texto} />
                </View>
                {last ? null : <View style={{ width: 2, flex: 1, minHeight: 12, backgroundColor: t.borde }} />}
              </View>
              <View style={{ flex: 1, gap: 2, paddingBottom: last ? 0 : espacio.md }}>
                <Texto variante="etiqueta">{step.title}</Texto>
                {step.detail.map((line, n) => (
                  <Texto key={`${n}-${line}`} variante="pequeno" suave>
                    {line}
                  </Texto>
                ))}
              </View>
            </View>
          </Entrada>
        );
      })}
    </CollapsibleCard>
  );
}

export function VerdictSheet({ item, decision }: { item: ProposalEvaluationItem; decision: ReviewDecision | undefined }) {
  const t = useTema();
  const answer = ANSWERS[item.verdict];
  const look = VERDICT_TONE[item.verdict];
  const tone = t[look.tone];
  const problems = issues(item, true);
  const doubts = issues(item, false);
  const checks = checklist(item);
  const cost = item.converted_cost !== null ? formatMoney(item.converted_cost, item.converted_currency) : item.real_cost !== null ? formatMoney(item.real_cost, item.currency) : 'No determinado';

  return (
    <View style={{ gap: espacio.md, padding: espacio.lg, borderRadius: radio.xl, backgroundColor: 'rgba(255,255,255,0.92)' }}>
      {/* 1. The answer, highlighted */}
      <View style={{ gap: espacio.sm, padding: espacio.md + 4, borderRadius: radio.xl, borderLeftWidth: 6, borderLeftColor: tone.texto, backgroundColor: tone.fondo }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.sm + 4 }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' }}>
            <Icono nombre={look.icon} tamano="lg" color={tone.texto} />
          </View>
          <Texto variante="subtitulo" accessibilityRole="header" style={{ flex: 1, fontFamily: 'Urbanist_700Bold', fontSize: 22, lineHeight: 28 }}>
            {answer.headline}
          </Texto>
        </View>
        <Texto>{answer.detail}</Texto>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.sm }}>
        <Stat label="Proveedor" value={item.supplier ?? item.filename} />
        <Stat label="Costo real" value={cost} />
        <Stat label="Puntaje" value={item.score !== null ? `${Number(item.score)} de 100` : 'Sin puntaje'} />
        <Stat label="Presupuesto" value={item.over_budget ? 'Lo supera' : 'Dentro'} tone={item.over_budget ? t.aviso.texto : t.exito.texto} />
      </View>
      {decision ? (
        <View style={{ flexDirection: 'row', gap: espacio.sm, alignItems: 'center', padding: espacio.sm + 4, borderRadius: radio.lg, backgroundColor: t.superficieAlta }}>
          <Icono nombre="user-check" tamano="sm" />
          <Texto variante="pequeno" style={{ flex: 1 }}>
            Verificado por {decision.decided_by}: {decision.approved ? 'aprobada' : 'no aprobada'}
            {decision.comment ? ` · «${decision.comment}»` : ''}
          </Texto>
        </View>
      ) : null}

      {item.trace && item.trace.length > 0 ? <DecisionTrace steps={item.trace} /> : null}

      {/* 2. What does not meet the requirements, then what still needs confirming */}
      {problems.length > 0 ? <SectionTitle>Lo que no cumple</SectionTitle> : null}
      {problems.map((i) => (
        <IssueCard key={i.code} issue={i} />
      ))}
      {doubts.length > 0 ? <SectionTitle>Por confirmar</SectionTitle> : null}
      {doubts.map((i) => (
        <IssueCard key={i.code} issue={i} />
      ))}
      {item.verdict === 'valida' && item.criteria.length > 0 ? (
        <>
          <SectionTitle>Por qué cumple</SectionTitle>
          {item.criteria.map((c) => (
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
          ))}
        </>
      ) : null}

      {/* 3. The same questions for everyone */}
      <CollapsibleCard title="Requisitos revisados" detail={`${checks.filter((c) => c.state === 'yes').length} de ${checks.length} cumplen`} defaultOpen>
      <View style={{ borderRadius: radio.lg, borderWidth: 1, borderColor: t.borde, backgroundColor: '#FFFFFF' }}>
        {checks.map((c, i) => {
          const state = CHECK_LOOK[c.state];
          return (
            <View key={c.code} accessible accessibilityLabel={`${c.question} ${state.label}`} style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.sm, minHeight: 44, paddingHorizontal: espacio.sm + 4, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: t.borde }}>
              <Texto variante="pequeno" style={{ flex: 1 }}>
                {c.question}
              </Texto>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radio.pildora, backgroundColor: t[state.tone].fondo }}>
                <Icono nombre={state.icon} tamano="sm" color={t[state.tone].texto} />
                <Texto variante="etiqueta" color={t[state.tone].texto}>
                  {state.label}
                </Texto>
              </View>
            </View>
          );
        })}
      </View>
      </CollapsibleCard>

      {/* 4. How the real cost is reached */}
      {item.cost_steps.length > 0 ? (
        <CollapsibleCard title="Costo real, paso a paso" detail={`${item.cost_steps.length} conceptos`}>
          {item.cost_steps.map((s, i) => (
            <View key={`${s.concept}-${i}`} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: espacio.md, paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: t.borde }}>
              <Texto variante="pequeno" style={{ flex: 1 }}>
                {s.concept}
                {s.detail ? ` · ${s.detail}` : ''}
              </Texto>
              <Texto variante="etiqueta">{s.amount === null ? 'No determinado' : formatMoney(s.amount, item.currency)}</Texto>
            </View>
          ))}
        </CollapsibleCard>
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
    </View>
  );
}
