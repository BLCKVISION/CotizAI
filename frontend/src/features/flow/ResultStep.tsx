/** Step 5: the final answer after the person's verification, with why yes and why no. */
import { View } from 'react-native';

import { Aviso } from '@/design/bloques';
import { Boton, Icono, Tarjeta, Texto } from '@/design/componentes';
import { Entrada } from '@/design/efectos';
import { useTema } from '@/design/tema';
import { espacio, radio } from '@/design/tokens';
import type { ProjectEvaluation, ReportFormat, ReviewDecision } from '@/features/evaluations/api';
import { AskCard } from '@/features/evaluations/AskCard';
import { formatMoney } from '@/features/evaluations/format';

import { type Outcome, outcomes, recommendation } from './flow';

type Item = ProjectEvaluation['items'][number];

const costOf = (i: Item) => (i.converted_cost !== null ? formatMoney(i.converted_cost, i.converted_currency) : i.real_cost !== null ? formatMoney(i.real_cost, i.currency) : 'Costo no determinado');

function Column({ title, approved, list, onOpen }: { title: string; approved: boolean; list: Outcome<Item>[]; onOpen: (id: string) => void }) {
  const t = useTema();
  const tone = approved ? t.exito : t.error;
  return (
    <View style={{ flexGrow: 1, flexBasis: 380, gap: espacio.sm }}>
      <Texto variante="subtitulo" color={tone.texto} accessibilityRole="header">
        {title} ({list.length})
      </Texto>
      {list.length === 0 ? <Texto suave>Ninguna.</Texto> : null}
      {list.map((o, i) => (
        <Entrada key={o.item.proposal_id} indice={Math.min(i, 8)}>
          <Tarjeta onPress={() => onOpen(o.item.proposal_id)} etiquetaAccesible={`Ver por qué: ${o.item.supplier ?? o.item.filename}`}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.sm + 4 }}>
              <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: tone.fondo }}>
                <Icono nombre={approved ? 'check' : 'x'} tamano="sm" color={tone.texto} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Texto variante="etiqueta" numberOfLines={1}>
                  {o.item.supplier ?? o.item.filename}
                </Texto>
                <Texto variante="pequeno" suave numberOfLines={1}>
                  {costOf(o.item)}
                  {o.changed ? ' · usted cambió la respuesta de la IA' : ''}
                </Texto>
              </View>
            </View>
            <Texto variante="pequeno">
              {approved ? 'Por qué sí: ' : 'Por qué no: '}
              {o.reason}
            </Texto>
          </Tarjeta>
        </Entrada>
      ))}
    </View>
  );
}

type Props = { evaluation: ProjectEvaluation; decisions: ReviewDecision[]; onOpen: (proposalId: string) => void; onDownload: (format: ReportFormat) => void };

export function ResultStep({ evaluation, decisions, onOpen, onDownload }: Props) {
  const t = useTema();
  const list = outcomes(evaluation.items, decisions);
  const best = recommendation(list);
  return (
    <View style={{ gap: espacio.md }}>
      <View style={{ padding: espacio.lg, borderRadius: radio.panel, gap: espacio.xs, backgroundColor: best ? t.exito.fondo : t.aviso.fondo }}>
        <Texto variante="sobretitulo" color={best ? t.exito.texto : t.aviso.texto}>
          RESPUESTA FINAL VERIFICADA POR UNA PERSONA
        </Texto>
        <Texto variante="titulo" accessibilityRole="header" style={{ fontFamily: 'Urbanist_600SemiBold' }}>
          {best ? `Sí: ${best.item.supplier ?? best.item.filename}` : 'No hay ninguna propuesta aprobada'}
        </Texto>
        <Texto>{best ? `${costOf(best.item)} · ${best.reason}` : 'Revise los motivos, agregue otras propuestas o vuelva a evaluar.'}</Texto>
        <Texto variante="pequeno" suave>
          La IA analiza e interpreta; la decisión final es humana. Adjudicar corresponde al aprobador.
        </Texto>
      </View>
      {evaluation.warnings.map((w) => (
        <Aviso key={w} tono="aviso" texto={w} />
      ))}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.md, alignItems: 'flex-start' }}>
        <Column approved title="Aprobadas" list={list.filter((o) => o.approved)} onOpen={onOpen} />
        <Column approved={false} title="Rechazadas" list={list.filter((o) => !o.approved)} onOpen={onOpen} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.sm }}>
        <Boton etiqueta="Descargar informe" icono="file-text" variante="secundario" onPress={() => onDownload('md')} />
        <Boton etiqueta="Descargar tabla (CSV)" icono="grid" variante="secundario" onPress={() => onDownload('csv')} />
      </View>
      <AskCard projectId={evaluation.project_id} />
    </View>
  );
}
