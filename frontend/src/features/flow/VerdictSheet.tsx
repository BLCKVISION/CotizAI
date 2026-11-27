/** The evaluation in plain words, written as Markdown so it reads as one ordered page. */
import { View } from 'react-native';

import { type NombreIcono, Texto, type Tono } from '@/design/componentes';
import { swatch, useTema } from '@/design/tema';
import { espacio, radio } from '@/design/tokens';
import type { ProposalEvaluationItem, ReviewDecision } from '@/core/api/evaluations';
import { type Bloque, bloquesDeMarkdown } from '@/core/markdown';
import { BloqueVista } from '@/design/MarkdownView';

import { evaluationMarkdown } from './evaluationMarkdown';

// "Does not meet the requirements" is an outcome, not a system error: warm amber, never red.
export const VERDICT_TONE: Record<ProposalEvaluationItem['verdict'], { tone: Tono; icon: NombreIcono }> = {
  valida: { tone: 'exito', icon: 'check' },
  descartada: { tone: 'aviso', icon: 'alert-circle' },
  pendiente_de_revision: { tone: 'info', icon: 'help-circle' },
};

/** Each heading level gets its own size and weight, so the page has a clear hierarchy. */
function Block({ block, first }: { block: Bloque; first: boolean }) {
  const t = useTema();
  if (block.tipo === 'titulo') {
    if (block.nivel === 1) {
      return (
        <Texto accessibilityRole="header" style={{ fontFamily: 'Urbanist_700Bold', fontSize: 30, lineHeight: 36 }}>
          {block.texto}
        </Texto>
      );
    }
    if (block.nivel === 2) {
      return (
        <Texto accessibilityRole="header" style={{ marginTop: first ? 0 : espacio.md, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: t.borde, fontFamily: 'Urbanist_700Bold', fontSize: 21, lineHeight: 28 }}>
          {block.texto}
        </Texto>
      );
    }
    return (
      <Texto accessibilityRole="header" style={{ fontFamily: 'Urbanist_600SemiBold', fontSize: 16, lineHeight: 22, color: t.aviso.texto }}>
        {block.texto}
      </Texto>
    );
  }
  if (block.tipo === 'tabla') return <BloqueVista bloque={block} inciertos={[]} minimoDeColumna={64} />;
  return (
    <Texto suave={first} style={{ fontSize: first ? 17 : 15, lineHeight: first ? 26 : 23 }}>
      {block.texto}
    </Texto>
  );
}

export function VerdictSheet({ item, decision }: { item: ProposalEvaluationItem; decision: ReviewDecision | undefined }) {
  const blocks = bloquesDeMarkdown(evaluationMarkdown(item, decision));
  return (
    <View style={{ gap: espacio.md, padding: espacio.xl, borderRadius: radio.xl, backgroundColor: swatch.white, minWidth: 0 }}>
      {/* The first block is the title and the second is the lead paragraph under it. */}
      {blocks.map((block, i) => (
        <Block key={i} block={block} first={i <= 1} />
      ))}
    </View>
  );
}
