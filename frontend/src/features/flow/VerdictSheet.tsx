/** The evaluation in plain words, written as Markdown so it reads as one ordered page. */
import { View } from 'react-native';

import { type NombreIcono, type Tono } from '@/design/componentes';
import { radio, espacio } from '@/design/tokens';
import type { ProposalEvaluationItem, ReviewDecision } from '@/features/evaluations/api';
import { bloquesDeMarkdown } from '@/features/transcripcion/markdown';
import { BloqueVista } from '@/features/transcripcion/Vista';

import { evaluationMarkdown } from './evaluationMarkdown';

// "Does not meet the requirements" is an outcome, not a system error: warm amber, never red.
export const VERDICT_TONE: Record<ProposalEvaluationItem['verdict'], { tone: Tono; icon: NombreIcono }> = {
  valida: { tone: 'exito', icon: 'check' },
  descartada: { tone: 'aviso', icon: 'alert-circle' },
  pendiente_de_revision: { tone: 'info', icon: 'help-circle' },
};

export function VerdictSheet({ item, decision }: { item: ProposalEvaluationItem; decision: ReviewDecision | undefined }) {
  const blocks = bloquesDeMarkdown(evaluationMarkdown(item, decision));
  return (
    <View style={{ gap: espacio.md, padding: espacio.lg, borderRadius: radio.xl, backgroundColor: '#FFFFFF' }}>
      {blocks.map((block, i) => (
        <BloqueVista key={i} bloque={block} inciertos={[]} minimoDeColumna={64} />
      ))}
    </View>
  );
}
