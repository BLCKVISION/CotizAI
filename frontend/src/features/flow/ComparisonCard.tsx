/** Which proposal is the best, why compared with the rest, and the buttons to download the decision. */
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { Boton, Insignia, Tarjeta, Texto } from '@/design/componentes';
import { useTema } from '@/design/tema';
import { espacio, radio } from '@/design/tokens';
import type { ProjectEvaluation, ReportFormat, ReviewDecision } from '@/features/evaluations/api';
import { formatMoney } from '@/features/evaluations/format';

import { compareProposals, type ComparisonStatus } from './comparison';

const DECISIONS: Record<ComparisonStatus, string> = { approved: 'Usted: aprobada', rejected: 'Usted: no aprobada', pending: 'Falta verificar' };
const VERDICTS: Record<string, { label: string; tone: 'exito' | 'aviso' | 'info' }> = {
  valida: { label: 'Válida', tone: 'exito' },
  descartada: { label: 'Descartada', tone: 'aviso' },
  pendiente_de_revision: { label: 'Por revisar', tone: 'info' },
};

type Props = { evaluation: ProjectEvaluation; decisions: ReviewDecision[]; initiallyOpen?: boolean; onDownload: (format: ReportFormat) => void };

export function ComparisonCard({ evaluation, decisions, initiallyOpen = false, onDownload }: Props) {
  const t = useTema();
  const [open, setOpen] = useState(initiallyOpen);
  const currency = evaluation.target_currency;
  const { rows, best, pending } = compareProposals(evaluation.items, decisions, currency);
  if (rows.length === 0) return null;
  const money = (value: number) => formatMoney(String(value), currency);
  const differenceText = (value: number) => (value === 0 ? 'mismo costo que la mejor' : `${money(Math.abs(value))} ${value > 0 ? 'más' : 'menos'} que la mejor`);
  return (
    <Tarjeta>
      <View style={{ gap: espacio.xs }}>
        <Texto variante="sobretitulo" suave>
          {best && pending > 0 ? 'MEJOR OPCIÓN POR AHORA' : 'MEJOR OPCIÓN'}
        </Texto>
        <Texto variante="subtitulo" accessibilityRole="header">
          {best ? (best.item.supplier ?? best.item.filename) : 'Ninguna propuesta se puede recomendar'}
        </Texto>
        {best ? (
          <Texto variante="pequeno" suave>
            {best.cost !== null ? money(best.cost) : 'Costo no comparable'}
            {best.item.score !== null ? ` · ${Number(best.item.score)} de 100` : ''}
            {pending > 0 ? ` · faltan ${pending} por verificar` : ''}
          </Texto>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.sm }}>
        {Platform.OS === 'web' ? (
          <>
            <Boton etiqueta="Descargar decisión (PDF)" icono="download" onPress={() => onDownload('pdf')} />
            <Boton etiqueta="Descargar comparación (Excel)" icono="grid" variante="secundario" onPress={() => onDownload('xlsx')} />
          </>
        ) : null}
        <Boton etiqueta={open ? 'Ocultar comparación' : `Comparar las ${rows.length} propuestas`} variante="secundario" onPress={() => setOpen(!open)} />
      </View>
      {open
        ? rows.map((row, index) => (
            <View key={row.item.proposal_id} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: espacio.sm, padding: espacio.sm + 4, borderRadius: radio.md, backgroundColor: row.isBest ? t.exito.fondo : '#F4F8FA' }}>
              <View style={{ flexGrow: 1, flexBasis: 220, minWidth: 0 }}>
                <Texto variante="etiqueta" numberOfLines={1}>
                  {index + 1}. {row.item.supplier ?? row.item.filename}
                  {row.isBest ? ' · mejor opción' : ''}
                </Texto>
                <Texto variante="pequeno" suave>
                  {row.cost !== null ? money(row.cost) : 'Costo no comparable'}
                  {row.item.score !== null ? ` · ${Number(row.item.score)} de 100` : ''}
                  {!row.isBest && row.difference !== null ? ` · ${differenceText(row.difference)}` : ''}
                  {` · ${DECISIONS[row.status]}`}
                </Texto>
              </View>
              <Insignia etiqueta={(VERDICTS[row.item.verdict] ?? VERDICTS.pendiente_de_revision).label} tono={(VERDICTS[row.item.verdict] ?? VERDICTS.pendiente_de_revision).tone} />
            </View>
          ))
        : null}
    </Tarjeta>
  );
}
