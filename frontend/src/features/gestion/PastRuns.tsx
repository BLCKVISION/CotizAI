/** Every evaluation run of a project, each with its own report. */
import { useState } from 'react';
import { View } from 'react-native';

import { useSesion } from '@/core/sesion/SesionProvider';
import { mensajeDeError, useDatos } from '@/core/useDatos';
import { Aviso, Cargando, ErrorConReintento, Fila } from '@/design/bloques';
import { CollapsibleCard } from '@/design/Collapsible';
import { BotonIcono, Texto } from '@/design/componentes';
import { espacio } from '@/design/tokens';
import { formatoFechaHora } from '@/design/projectStatus';

import { type EvaluationRun, evaluationRunsApi, runReportApi } from '../../core/api/history';

const summary = (run: EvaluationRun) =>
  `${run.evaluated_by} · ${run.valid} de ${run.proposals} válidas · ${run.recommended ? `recomendada: ${run.recommended}` : 'sin recomendación'}`;

export function PastRuns({ projectId }: { projectId: string }) {
  const { conSesion } = useSesion();
  const runs = useDatos(evaluationRunsApi(projectId), projectId);
  const [failure, setFailure] = useState<string | null>(null);

  const download = async (run: EvaluationRun, format: 'pdf' | 'csv' | 'xlsx') => {
    try {
      const url = URL.createObjectURL(await conSesion(runReportApi(projectId, run.id, format)));
      const link = document.createElement('a');
      link.href = url;
      link.download = `informe-${run.evaluated_at.slice(0, 16).replace(/[:T]/g, '-')}.${format}`;
      link.click();
      URL.revokeObjectURL(url);
      setFailure(null);
    } catch (e) {
      setFailure(mensajeDeError(e));
    }
  };

  return (
    <CollapsibleCard title="Evaluaciones anteriores" detail={runs.datos ? `${runs.datos.length} guardada(s)` : undefined}>
      {failure ? <Aviso texto={failure} /> : null}
      {runs.error ? <ErrorConReintento texto={runs.error} onReintentar={runs.recargar} /> : null}
      {!runs.datos && !runs.error ? <Cargando /> : null}
      {runs.datos?.length === 0 ? <Texto suave>Todavía no hay evaluaciones guardadas en el historial.</Texto> : null}
      {runs.datos?.map((run) => (
        <Fila
          key={run.id}
          icono="clock"
          titulo={formatoFechaHora(run.evaluated_at)}
          detalle={summary(run)}
          derecha={
            <View style={{ flexDirection: 'row', gap: espacio.xs }}>
              <BotonIcono nombre="file-text" etiqueta="Descargar informe en PDF" onPress={() => void download(run, 'pdf')} />
              <BotonIcono nombre="list" etiqueta="Descargar tabla en CSV" onPress={() => void download(run, 'csv')} />
              <BotonIcono nombre="grid" etiqueta="Descargar tabla en Excel" onPress={() => void download(run, 'xlsx')} />
            </View>
          }
        />
      ))}
    </CollapsibleCard>
  );
}
