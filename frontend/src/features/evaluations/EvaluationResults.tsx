/** Evaluation of a project: trigger, exchange rate, recommendation, ranking, report and questions. */
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { useSesion } from '@/core/sesion/SesionProvider';
import { mensajeDeError } from '@/core/useDatos';
import { Aviso, Cargando, ErrorConReintento } from '@/design/bloques';
import { CollapsibleCard } from '@/design/Collapsible';
import { Boton, Insignia, Tarjeta, Texto } from '@/design/componentes';
import { espacio } from '@/design/tokens';
import { showToast } from '@/design/toastStore';
import type { Proyecto } from '@/features/proyectos/api';
import { formatoFechaHora } from '@/features/proyectos/estados';

import { downloadReportApi, type ProjectEvaluation, type ReportFormat } from './api';
import { AskCard } from './AskCard';
import { EvaluationProcess } from './EvaluationProcess';
import { costShare, formatMoney } from './format';
import { ProposalResultCard } from './ProposalResultCard';
import { RatePanel } from './RatePanel';
import { useProjectEvaluation } from './useProjectEvaluation';

function Recommendation({ evaluation }: { evaluation: ProjectEvaluation }) {
  const best = evaluation.items.find((i) => i.verdict === 'valida');
  const count = (verdict: string) => evaluation.items.filter((i) => i.verdict === verdict).length;
  return (
    <Tarjeta>
      <Texto variante="sobretitulo" suave>
        {best ? 'RECOMENDACIÓN DEL AGENTE' : 'SIN RECOMENDACIÓN'}
      </Texto>
      <Texto variante="titulo" accessibilityRole="header">
        {best ? (best.supplier ?? best.filename) : 'Ninguna propuesta resultó válida'}
      </Texto>
      {best ? (
        <Texto>
          {Number(best.score)} puntos de 100 · costo real{' '}
          {best.converted_cost !== null
            ? formatMoney(best.converted_cost, best.converted_currency)
            : formatMoney(best.real_cost, best.currency)}
        </Texto>
      ) : (
        <Texto suave>Revise los hallazgos y las propuestas pendientes.</Texto>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.sm }}>
        <Insignia etiqueta={`Válidas: ${count('valida')}`} tono="exito" icono="check-circle" />
        <Insignia etiqueta={`Pendientes: ${count('pendiente_de_revision')}`} tono="aviso" icono="alert-circle" />
        <Insignia etiqueta={`Descartadas: ${count('descartada')}`} tono="error" icono="x-circle" />
      </View>
      <Texto variante="pequeno" suave>
        Evaluado el {formatoFechaHora(evaluation.evaluated_at)}. Es un apoyo: la adjudicación la decide el comité.
      </Texto>
    </Tarjeta>
  );
}

type Props = { project: Proyecto; proposalCount: number; proposalNames: string[]; minimumProposals: number; onEvaluated: () => void };

export function EvaluationResults({ project, proposalCount, proposalNames, minimumProposals, onEvaluated }: Props) {
  const { usuario, conSesion } = useSesion();
  const role = usuario?.rol;
  const canStart = role === 'cargador' || role === 'evaluador';
  const canView = role !== undefined && role !== 'cargador';
  const { evaluation, rates, ratesError, loading, running, elapsed, error, run, saveRate, reload } = useProjectEvaluation(project.id, canView);
  const [confirming, setConfirming] = useState(false);
  const [showProcess, setShowProcess] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const closed = project.estado === 'adjudicado' || project.estado === 'cerrado';
  const missing = Math.max(0, minimumProposals - proposalCount);
  const alreadyEvaluated = project.estado === 'en_revision_del_comite';

  const evaluate = async () => {
    if (alreadyEvaluated && !confirming) return setConfirming(true);
    setConfirming(false);
    setShowProcess(true);
    const completed = await run();
    if (completed) showToast({ tone: 'success', title: 'Evaluación completada' });
    onEvaluated(); // also after a failure: the server may have restored the project state
  };

  const download = async (format: ReportFormat) => {
    try {
      const url = URL.createObjectURL(await conSesion(downloadReportApi(project.id, format)));
      const link = document.createElement('a');
      link.href = url;
      link.download = `informe-evaluacion.${format}`;
      link.click();
      URL.revokeObjectURL(url);
      setDownloadError(null);
    } catch (e) {
      setDownloadError(mensajeDeError(e));
    }
  };

  const results = evaluation && !evaluation.restricted ? evaluation : null;
  const comparable = results?.items.map((i) => i.converted_cost) ?? [];

  return (
    <View style={{ gap: espacio.md }}>
      <CollapsibleCard title="Evaluación del agente" detail="Lee, verifica, calcula el costo real y ordena" defaultOpen>
        <RatePanel rates={rates} error={ratesError} canRegister={role === 'evaluador'} onSave={saveRate} />
        {canStart && !closed ? (
          <Boton
            etiqueta={confirming ? 'Confirmar: reemplazar el resultado' : alreadyEvaluated ? 'Volver a evaluar' : 'Evaluar propuestas'}
            icono="cpu"
            cargando={running}
            deshabilitado={missing > 0}
            onPress={() => void evaluate()}
          />
        ) : null}
        {running ? <Boton etiqueta={`Ver el proceso (${elapsed} s)`} icono="activity" variante="secundario" onPress={() => setShowProcess(true)} /> : null}
        <EvaluationProcess visible={showProcess} running={running} elapsed={elapsed} files={proposalNames} evaluation={evaluation} error={error} onClose={() => setShowProcess(false)} />
        {canStart && !closed && missing > 0 ? <Aviso tono="info" texto={`Faltan ${missing} propuesta(s) para poder evaluar.`} /> : null}
        {evaluation?.restricted ? (
          <Aviso tono="exito" texto={`Evaluación completada: ${evaluation.evaluated_count} propuestas. Los resultados los ve el comité (evaluador, aprobador o auditor).`} />
        ) : null}
        {error ? <ErrorConReintento texto={error} onReintentar={() => void (canView ? reload() : evaluate())} /> : null}
      </CollapsibleCard>

      {loading ? <Cargando /> : null}

      {results ? (
        <>
          {results.warnings.map((w) => (
            <Aviso key={w} tono="aviso" texto={w} />
          ))}
          <Recommendation evaluation={results} />
          <Texto variante="subtitulo" accessibilityRole="header">
            Ranking y veredictos
          </Texto>
          {results.items.map((item, index) => (
            <ProposalResultCard
              key={item.proposal_id}
              item={item}
              position={index + 1}
              costShare={costShare(item.converted_cost, comparable)}
              targetCurrency={results.target_currency}
            />
          ))}
          {results.exchange_rates.length > 0 ? (
            <CollapsibleCard title="Tasas aplicadas" detail={`Moneda de comparación: ${results.target_currency}`}>
              {results.exchange_rates.map((r) => (
                <Texto key={`${r.base}-${r.quote}-${r.effective_date}-${r.origin}`} variante="pequeno">
                  {r.base}/{r.quote} = {r.value} · {r.origin === 'bcv' ? 'BCV' : `manual: ${r.source}`} · fecha valor {r.effective_date}
                </Texto>
              ))}
            </CollapsibleCard>
          ) : null}
          {Platform.OS === 'web' ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.sm }}>
              <Boton etiqueta="Descargar informe" icono="file-text" variante="secundario" onPress={() => void download('md')} />
              <Boton etiqueta="Descargar tabla (CSV)" icono="grid" variante="secundario" onPress={() => void download('csv')} />
            </View>
          ) : null}
          {downloadError ? <Aviso texto={downloadError} /> : null}
          <AskCard projectId={project.id} />
        </>
      ) : null}
    </View>
  );
}
