/** The AI's analysis of one proposal written as Markdown, so it reads as one ordered page. */
import type { ProposalEvaluationItem, ReviewDecision } from '@/features/evaluations/api';
import { CRITERION_LABELS, formatMoney } from '@/features/evaluations/format';

import { ANSWERS, checklist, type CheckState, issues, type Issue } from './flow';

const STATE_LABEL: Record<CheckState, string> = { yes: 'Cumple', no: 'No cumple', doubt: 'Por confirmar', unchecked: 'Sin verificar' };
const cell = (value: string) => value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
const table = (header: string[], rows: string[][]) =>
  [`| ${header.join(' | ')} |`, `| ${header.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n');

function issueLines(list: Issue[]): string[] {
  return list.flatMap((i) => [
    `### ${i.title}`,
    ...(i.meaning ? [i.meaning] : []),
    ...(i.points.length > 0 ? [i.points.map((p) => `• ${p}`).join('\n')] : []),
    ...i.quotes.map((q) => `En el documento${i.byAi ? ' (señalado por la IA: confirme la cita)' : ''}: «${q}»`),
  ]);
}

export function evaluationMarkdown(item: ProposalEvaluationItem, decision: ReviewDecision | undefined): string {
  const cost = item.converted_cost !== null ? formatMoney(item.converted_cost, item.converted_currency) : item.real_cost !== null ? formatMoney(item.real_cost, item.currency) : 'No determinado';
  const answer = ANSWERS[item.verdict];
  const checks = checklist(item);
  const problems = issues(item, true);
  const doubts = issues(item, false);
  const parts: string[] = [`# ${answer.headline}`, answer.detail];

  parts.push(
    table(['Dato', 'Valor'], [
      ['Proveedor', item.supplier ?? item.filename],
      ['Costo real', cost],
      ['Puntaje', item.score !== null ? `${Number(item.score)} de 100` : 'Sin puntaje'],
      ['Presupuesto', item.over_budget ? 'Lo supera' : 'Dentro'],
    ]),
  );
  if (decision) {
    parts.push(`Verificado por ${decision.decided_by}: ${decision.approved ? 'aprobada' : 'no aprobada'}${decision.comment ? ` · «${decision.comment}»` : ''}`);
  }
  if (problems.length > 0) parts.push('## Lo que no cumple', ...issueLines(problems));
  if (doubts.length > 0) parts.push('## Por confirmar', ...issueLines(doubts));
  if (item.verdict === 'valida' && item.criteria.length > 0) {
    parts.push('## Por qué cumple', table(['Criterio', 'Puntaje', 'Peso'], item.criteria.map((c) => [CRITERION_LABELS[c.criterion] ?? c.criterion, `${c.score} de 100`, `${c.weight} %`])));
  }
  parts.push(
    `## Requisitos revisados (${checks.filter((c) => c.state === 'yes').length} de ${checks.length} cumplen)`,
    table(['Pregunta', 'Resultado'], checks.map((c) => [c.question, STATE_LABEL[c.state]])),
  );
  if (item.cost_steps.length > 0) {
    parts.push(
      '## Costo real, paso a paso',
      table(['Concepto', 'Monto'], item.cost_steps.map((s) => [`${s.concept}${s.detail ? ` · ${s.detail}` : ''}`, s.amount === null ? 'No determinado' : formatMoney(s.amount, item.currency)])),
    );
  }
  if (item.trace && item.trace.length > 0) {
    parts.push('## Cómo se decidió', table(['Paso', 'Qué encontró'], item.trace.map((s) => [s.title, s.detail.join(' ')])));
  }
  if (item.supplier_history.length > 0) parts.push('## Antecedentes del proveedor', item.supplier_history.map((h) => `• ${h}`).join('\n'));
  if (item.reading_warnings.length > 0) parts.push('## Avisos de lectura', item.reading_warnings.map((w) => `• ${w}`).join('\n'));
  return parts.join('\n\n');
}
