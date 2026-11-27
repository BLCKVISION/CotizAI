/** The final answer after the person's verification, written out in full, with why yes and why no. No steps here. */
import { View } from 'react-native';

import { Aviso } from '@/design/bloques';
import { Boton, Icono, Tarjeta, Texto } from '@/design/componentes';
import { Entrada } from '@/design/efectos';
import { useTema } from '@/design/tema';
import { espacio, radio } from '@/design/tokens';
import type { ProjectEvaluation, ReportFormat, ReviewDecision } from '@/features/evaluations/api';
import { AskCard } from '@/features/evaluations/AskCard';
import { formatMoney } from '@/features/evaluations/format';

import { finalAnswer, issues, type Outcome, outcomes } from './flow';

type Item = ProjectEvaluation['items'][number];

const costOf = (i: Item) => (i.converted_cost !== null ? formatMoney(i.converted_cost, i.converted_currency) : i.real_cost !== null ? formatMoney(i.real_cost, i.currency) : null);

function Detail({ outcome, onOpen }: { outcome: Outcome<Item>; onOpen: () => void }) {
  const t = useTema();
  const { item, approved } = outcome;
  const tone = approved ? t.exito : t.aviso;
  // A rejected proposal lists what discarded it; an approved one, anything still worth checking. One entry per kind.
  const found = [...issues(item, true), ...(approved ? issues(item, false) : [])];
  const name = item.supplier ?? item.filename;
  return (
    <Tarjeta onPress={onOpen} etiquetaAccesible={`Ver el detalle de ${name}`}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: espacio.sm + 4 }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: tone.fondo }}>
          <Icono nombre={approved ? 'check' : 'x'} color={tone.texto} />
        </View>
        <View style={{ flexGrow: 1, flexBasis: 220, minWidth: 0 }}>
          <Texto variante="subtitulo" numberOfLines={1}>
            {name}
          </Texto>
          <Texto variante="pequeno" suave numberOfLines={1}>
            {costOf(item) ?? 'Costo no determinado'}
            {item.over_budget ? ' · supera el presupuesto' : ''}
            {outcome.changed ? ' · usted cambió la respuesta de la IA' : ''}
          </Texto>
        </View>
        <Texto variante="etiqueta" color={tone.texto}>
          {approved ? 'Aprobada' : 'No aprobada'}
        </Texto>
      </View>
      {outcome.changed ? <Texto>Comentario de la verificación: «{outcome.reason}»</Texto> : null}
      {found.map((issue) => (
        <View key={issue.title} style={{ paddingLeft: espacio.sm + 4, borderLeftWidth: 3, borderLeftColor: t.aviso.texto, gap: 2 }}>
          <Texto variante="etiqueta">{issue.title}</Texto>
          {issue.points.map((p) => (
            <Texto key={p} variante="pequeno">
              {p}
            </Texto>
          ))}
        </View>
      ))}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Texto variante="etiqueta">Ver las citas y el costo paso a paso</Texto>
        <Icono nombre="arrow-right" tamano="sm" />
      </View>
    </Tarjeta>
  );
}

type Props = { evaluation: ProjectEvaluation; decisions: ReviewDecision[]; onOpen: (proposalId: string) => void; onDownload: (format: ReportFormat) => void };

export function ResultStep({ evaluation, decisions, onOpen, onDownload }: Props) {
  const t = useTema();
  const list = outcomes(evaluation.items, decisions);
  if (list.length === 0) return <Aviso tono="info" texto="Todavía no hay propuestas verificadas." />;
  const answer = finalAnswer(list, costOf, (i) => (i.score === null ? null : Number(i.score)));
  const tone = answer.approved ? t.exito : t.aviso;
  // Approved first; the server already ranked each group.
  const ordered = [...list.filter((o) => o.approved), ...list.filter((o) => !o.approved)];
  return (
    <View style={{ width: '100%', maxWidth: 920, alignSelf: 'center', gap: espacio.md }}>
      <Entrada>
        <View accessibilityLiveRegion="polite" style={{ alignItems: 'center', padding: espacio.xl, borderRadius: radio.panel, gap: espacio.md, backgroundColor: tone.fondo }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' }}>
            <Icono nombre={answer.approved ? 'award' : 'alert-triangle'} tamano="xl" color={tone.texto} />
          </View>
          <View style={{ alignItems: 'center', gap: espacio.xs }}>
            <Texto variante="sobretitulo" color={tone.texto}>
              {answer.label.toUpperCase()}
            </Texto>
            <Texto variante="titulo" accessibilityRole="header" style={{ fontFamily: 'Urbanist_700Bold', textAlign: 'center' }}>
              {answer.headline}
            </Texto>
          </View>
          <View style={{ gap: espacio.sm, maxWidth: 680 }}>
            {answer.paragraphs.map((p) => (
              <Texto key={p} style={{ textAlign: 'center', fontSize: 17, lineHeight: 26 }}>
                {p}
              </Texto>
            ))}
          </View>
          <Texto variante="pequeno" suave style={{ textAlign: 'center' }}>
            Respuesta verificada por una persona. La IA analiza; adjudicar corresponde al aprobador.
          </Texto>
        </View>
      </Entrada>
      {/* The server's "no valid proposal" notice only repeats the answer above. */}
      {evaluation.warnings.filter((w) => answer.approved || !w.startsWith('Ninguna propuesta resultó válida')).map((w) => (
        <Aviso key={w} tono="aviso" texto={w} />
      ))}
      <Texto variante="subtitulo" accessibilityRole="header">
        {ordered.length === 1 ? 'Detalle de la propuesta' : `Detalle de las ${ordered.length} propuestas`}
      </Texto>
      {ordered.map((o, i) => (
        <Entrada key={o.item.proposal_id} indice={Math.min(i + 1, 8)}>
          <Detail outcome={o} onOpen={() => onOpen(o.item.proposal_id)} />
        </Entrada>
      ))}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: espacio.sm }}>
        <Boton etiqueta="Descargar PDF" icono="file-text" variante="secundario" onPress={() => onDownload('pdf')} />
        <Boton etiqueta="Descargar Excel" icono="grid" variante="secundario" onPress={() => onDownload('xlsx')} />
        <Boton etiqueta="Descargar Markdown" icono="file-text" variante="secundario" onPress={() => onDownload('md')} />
      </View>
      <AskCard projectId={evaluation.project_id} />
    </View>
  );
}
