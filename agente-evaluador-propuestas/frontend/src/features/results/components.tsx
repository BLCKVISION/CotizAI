import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon, Badge, Card, AppText } from '@/design/components';
import { useTheme } from '@/design/theme';
import { spacing, radius, touchSize } from '@/design/tokens';
import { formatAmount } from '@/features/projects/states';

import { noticesOf, CAUSES, undeterminedCost, discardsByCode, verdictLabel, verdictTone } from './logic';
import type { Ranked } from './logic';
import type { Criterion, EvaluatedLine, EvaluatedProposal } from './types';

export const money = (value: string | null, currency: string | null) =>
  value === null ? 'No determinado' : `${currency ?? ''} ${formatAmount(value)}`.trim();

/** Cita que respalda una cifra o un motivo: se abre bajo demanda, con ubicación y texto tal cual del documento. */
export function Evidence({ location, text, label = 'Ver evidencia' }: { location?: string; text: string; label?: string }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  if (!text.trim()) {
    return (
      <AppText variant="small" color={t.warning.text}>
        Sin evidencia citada
      </AppText>
    );
  }
  return (
    <View style={{ gap: spacing.xs }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${open ? 'Ocultar' : label}${location ? `, ${location}` : ''}`}
        onPress={() => setOpen((a) => !a)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 32, alignSelf: 'flex-start' }}
      >
        <Icon name="file-text" size="sm" color={t.focus} />
        <AppText variant="label" color={t.focus}>
          {open ? 'Ocultar evidencia' : label}
          {location ? ` · ${location}` : ''}
        </AppText>
      </Pressable>
      {open ? (
        <View
          style={{
            borderLeftWidth: 3,
            borderLeftColor: t.focus,
            backgroundColor: t.highSurface,
            borderRadius: radius.sm,
            padding: spacing.sm + 2,
            gap: spacing.xs,
          }}
        >
          {location ? (
            <AppText variant="eyebrow" soft>
              {location.toUpperCase()}
            </AppText>
          ) : null}
          <AppText variant="small" selectable>
            «{text}»
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={{ gap: 2, flexGrow: 1, flexBasis: 120 }}>
      <AppText variant="eyebrow" soft>
        {label.toUpperCase()}
      </AppText>
      <AppText variant="subtitle" color={tone}>
        {value}
      </AppText>
    </View>
  );
}

export function RecommendedCard({ p, reason }: { p: Ranked; reason: string }) {
  const t = useTheme();
  const partial = undeterminedCost(p);
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
        <Badge label="Recomendada" tone="success" icon="award" />
        <AppText variant="small" soft>
          Propuesta de decisión: la adjudicación la resuelve el comité.
        </AppText>
      </View>
      <AppText variant="title" style={{ fontSize: 28, lineHeight: 34 }}>
        {p.supplier ?? p.id}
      </AppText>
      <AppText variant="small" soft>
        {p.id}
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, marginTop: spacing.sm }}>
        <Figure label="Puntaje técnico" value={p.score ?? '—'} />
        <Figure label={partial ? 'Costo (parcial)' : 'Costo real'} value={money(p.cost.total, p.currency)} tone={partial ? t.warning.text : undefined} />
      </View>
      <View style={{ height: 1, backgroundColor: t.border, marginVertical: spacing.xs }} />
      <AppText variant="eyebrow" soft>
        POR QUÉ
      </AppText>
      <AppText style={{ maxWidth: 720 }}>{reason}</AppText>
    </Card>
  );
}

const CRITERION_NAMES: [keyof NonNullable<EvaluatedProposal['criteria']>, string][] = [
  ['performance', 'Rendimiento'],
  ['protection_and_peripherals', 'Protección y periféricos'],
  ['warranty_and_support', 'Garantía y soporte'],
];

function CriterionCell({ c }: { c: Criterion | undefined }) {
  if (!c) return <AppText soft>—</AppText>;
  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="bodyMedium">{c.score}</AppText>
      <Evidence text={c.evidence.join(' · ')} label="Evidencia" />
    </View>
  );
}

/** Matriz propuesta × criterio. En pantallas angostas cada propuesta es un bloque con sus tres criterios. */
export function CriteriaMatrix({ proposals }: { proposals: Ranked[] }) {
  const t = useTheme();
  const valid = proposals.filter((p) => p.criteria);
  if (valid.length === 0) return null;
  return (
    <Card>
      <AppText variant="eyebrow" soft>
        MATRIZ DE CRITERIOS (0–100)
      </AppText>
      {valid.map((p) => (
        <View key={p.id} style={{ gap: spacing.sm, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: t.border }}>
          <AppText variant="label">
            {p.position}. {p.supplier ?? p.id}
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
            {CRITERION_NAMES.map(([key, name]) => (
              <View key={key} style={{ flexGrow: 1, flexBasis: 180, gap: spacing.xs }}>
                <AppText variant="small" soft>
                  {name}
                </AppText>
                <CriterionCell c={p.criteria?.[key]} />
              </View>
            ))}
          </View>
        </View>
      ))}
    </Card>
  );
}

function LineRow({ l, currency }: { l: EvaluatedLine; currency: string | null }) {
  const t = useTheme();
  const amount = (m: EvaluatedLine['line_total']) => (m ? money(m.value, currency) : 'No consta');
  return (
    <View style={{ gap: spacing.xs, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: t.border }}>
      <AppText variant="bodyMedium">{l.description}</AppText>
      <AppText variant="small" soft>
        {l.quantity?.literal ?? 'No consta'} × {amount(l.unit_price)} = {amount(l.line_total)}
      </AppText>
      <Evidence location={l.evidence.page_or_cell} text={l.evidence.text} />
    </View>
  );
}

function Findings({ p, onlyWarnings }: { p: EvaluatedProposal; onlyWarnings: boolean }) {
  const t = useTheme();
  const items = onlyWarnings ? noticesOf(p) : discardsByCode(p);
  if (items.length === 0) return null;
  return (
    <View style={{ gap: spacing.sm }}>
      {items.map((h, i) => (
        <View key={`${h.code}-${i}`} style={{ gap: spacing.xs }}>
          <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center', flexWrap: 'wrap' }}>
            <Badge label={h.code} tone={h.discards ? 'error' : 'warning'} icon={h.discards ? 'x-circle' : 'alert-triangle'} />
            <AppText variant="label" style={{ flexShrink: 1 }}>
              {CAUSES[h.code] ?? h.code}
            </AppText>
            <AppText variant="small" soft color={t.softText}>
              Origen: {h.origin === 'ai' ? 'IA' : h.origin === 'person' ? 'person' : 'rule'}
            </AppText>
          </View>
          <AppText>{h.reason}</AppText>
          <Evidence text={h.evidence} label="Ver cita" />
        </View>
      ))}
    </View>
  );
}

/** Desglose completo de una propuesta: costo paso a paso, líneas con su evidencia y avisos. */
export function Breakdown({ p }: { p: EvaluatedProposal }) {
  const t = useTheme();
  return (
    <View style={{ gap: spacing.md }}>
      <Findings p={p} onlyWarnings />
      <View style={{ gap: spacing.xs }}>
        <AppText variant="eyebrow" soft>
          COSTO REAL PASO A PASO
        </AppText>
        {p.cost.steps.map((step) => (
          <View key={step.item} style={{ paddingVertical: spacing.xs, gap: 2 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md }}>
              <AppText style={{ flexShrink: 1 }}>{step.item}</AppText>
              <AppText variant="bodyMedium" color={step.amount === null ? t.warning.text : undefined}>
                {money(step.amount, p.currency)}
              </AppText>
            </View>
            {step.detail ? <Evidence text={step.detail} label="Ver origen" /> : null}
          </View>
        ))}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: t.border, paddingTop: spacing.sm }}>
          <AppText variant="label">{undeterminedCost(p) ? 'Total (indeterminado)' : 'Total'}</AppText>
          <AppText variant="label">{money(p.cost.total, p.currency)}</AppText>
        </View>
      </View>
      {p.lines.length > 0 ? (
        <View>
          <AppText variant="eyebrow" soft>
            LÍNEAS DE LA PROPUESTA
          </AppText>
          {p.lines.map((l, i) => (
            <LineRow key={`${l.description}-${i}`} l={l} currency={p.currency} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function ProposalCard({ p, position }: { p: EvaluatedProposal; position?: number }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${p.supplier ?? p.id}, ${verdictLabel[p.verdict]}. ${open ? 'Ocultar' : 'Ver'} desglose`}
        onPress={() => setOpen((a) => !a)}
        style={{ gap: spacing.sm, minHeight: touchSize }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
          {position ? (
            <View style={{ width: 32, height: 32, borderRadius: radius.pill, backgroundColor: t.highSurface, alignItems: 'center', justifyContent: 'center' }}>
              <AppText variant="label">{position}</AppText>
            </View>
          ) : null}
          <AppText variant="bodyMedium" style={{ flexShrink: 1, flexGrow: 1 }}>
            {p.supplier ?? p.id}
          </AppText>
          <Badge
            label={verdictLabel[p.verdict]}
            tone={verdictTone(p.verdict)}
            icon={p.verdict === 'valid' ? 'check-circle' : p.verdict === 'discarded' ? 'x-circle' : 'clock'}
          />
          <Icon name={open ? 'chevron-up' : 'chevron-down'} color={t.softText} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg }}>
          <Figure label="Puntaje" value={p.score ?? '—'} />
          <Figure label={undeterminedCost(p) ? 'Costo (parcial)' : 'Costo real'} value={money(p.cost.total, p.currency)} />
        </View>
      </Pressable>
      {open ? <Breakdown p={p} /> : null}
    </Card>
  );
}

export function DiscardCard({ p }: { p: EvaluatedProposal }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
        <AppText variant="bodyMedium" style={{ flexShrink: 1, flexGrow: 1 }}>
          {p.supplier ?? p.id}
        </AppText>
        <Badge label="Descartada" tone="error" icon="x-circle" />
      </View>
      <Findings p={p} onlyWarnings={false} />
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((a) => !a)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 32, alignSelf: 'flex-start' }}
      >
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size="sm" color={t.focus} />
        <AppText variant="label" color={t.focus}>
          {open ? 'Ocultar desglose' : 'Ver desglose'}
        </AppText>
      </Pressable>
      {open ? <Breakdown p={p} /> : null}
    </Card>
  );
}
