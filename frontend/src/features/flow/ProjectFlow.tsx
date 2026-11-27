/**
 * Inside a project: preparation (documents and one "evaluate" button) → AI analysis → human yes/no → final answer.
 * Steps are shown only while evaluating and verifying. The content scrolls; the action bar stays inside the window.
 */
import { useState } from 'react';
import { Platform, Pressable, ScrollView, TextInput, View } from 'react-native';

import { can } from '@/core/auth/permissions';
import { pickFiles, ACCEPT_DOCUMENTS, ACCEPT_PHOTOS } from '@/core/files';
import { useSesion } from '@/core/sesion/SesionProvider';
import { mensajeDeError, useDatos } from '@/core/useDatos';
import { Cargando, ErrorConReintento } from '@/design/bloques';
import { Boton, Icono, Tarjeta, Texto } from '@/design/componentes';
import { useDispositivo } from '@/design/dispositivo';
import { Entrada, soloWeb, vidrio } from '@/design/efectos';
import { useTema } from '@/design/tema';
import { showToast } from '@/design/toastStore';
import { espacio, radio, texto } from '@/design/tokens';
import { downloadReportApi, getReviewsApi, type ReportFormat, sendReviewApi } from '@/features/evaluations/api';
import { EvaluationProcess } from '@/features/evaluations/EvaluationProcess';
import { RatePanel } from '@/features/evaluations/RatePanel';
import { useProjectEvaluation } from '@/features/evaluations/useProjectEvaluation';
import { propuestasApi } from '@/features/gestion/api';
import { Expediente, ZonaDeCarga } from '@/features/gestion/Expediente';
import { MarkdownDialog } from '@/features/gestion/MarkdownDialog';
import { useProposalUpload } from '@/features/home/useProposalUpload';
import type { Proyecto } from '@/features/proyectos/api';
import { UploadFlow } from '@/features/uploads/UploadFlow';

import { DocumentTile } from './DocumentTile';
import { currentStep, defaultSelection, EVALUATION_STEPS, MAX_PER_RUN, pendingVerification, selectionProblem, type StepId } from './flow';
import { PreparationHero } from './PreparationHero';
import { ResultStep } from './ResultStep';
import { Stepper } from './Stepper';
import { VERDICT_TONE, VerdictSheet } from './VerdictSheet';

type PressState = { pressed: boolean; hovered?: boolean; focused?: boolean };
const EVALUATED_STATES = ['en_revision_del_comite', 'adjudicado', 'cerrado'];

export function ProjectFlow({ project, onProjectChange }: { project: Proyecto; onProjectChange: () => void }) {
  const t = useTema();
  const { dispositivo } = useDispositivo();
  const { usuario, conSesion } = useSesion();
  const role = usuario?.rol;
  const seesResults = can(role, 'seeResults');
  const closed = project.estado === 'adjudicado' || project.estado === 'cerrado';
  const proposals = useDatos(propuestasApi(project.id), project.id);
  const { evaluation, rates, ratesError, loading, running, elapsed, error, run, saveRate, reload } = useProjectEvaluation(project.id, seesResults);
  const results = evaluation && !evaluation.restricted ? evaluation : null;
  const reviews = useDatos(
    (token) => (seesResults && results ? getReviewsApi(project.id)(token) : Promise.resolve([])),
    `${project.id}-${results?.evaluated_at ?? 'none'}`,
  );
  const upload = useProposalUpload(() => {
    proposals.recargar();
    onProjectChange();
  });

  const [chosenStep, setChosenStep] = useState<StepId | null>(null);
  const [selection, setSelection] = useState<Set<string> | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [showProcess, setShowProcess] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);

  if (proposals.error) return <ErrorConReintento texto={proposals.error} onReintentar={proposals.recargar} />;
  if (!proposals.datos || loading) return <Cargando />;

  const list = proposals.datos;
  const items = results?.items ?? [];
  const decisions = reviews.datos ?? [];
  const evaluated = new Set(items.map((i) => i.proposal_id));
  // Roles without access to results only know that an evaluation exists from the project state.
  const hasEvaluation = results !== null || evaluation?.restricted === true || (!seesResults && EVALUATED_STATES.includes(project.estado));
  const reached: StepId = !seesResults && hasEvaluation ? 'verification' : currentStep({ proposalCount: list.length, hasEvaluation, items, decisions });
  const step: StepId = chosenStep ?? reached;
  const selected = selection ?? new Set(defaultSelection(list.map((p) => p.id), [...evaluated]));
  const chosenCount = [...selected].filter((id) => list.some((p) => p.id === id)).length;
  const problem = selectionProblem(chosenCount, list.length);
  const unanalysed = results ? list.filter((p) => !evaluated.has(p.id)).length : 0;
  const pending = pendingVerification(items, decisions);
  const open = items.find((i) => i.proposal_id === openId) ?? pending[0] ?? items[0] ?? null;
  const decisionFor = (id: string) => decisions.find((d) => d.proposal_id === id);
  const canUpload = can(role, 'upload') && !closed && Platform.OS === 'web';
  const canEvaluate = can(role, 'evaluate') && !closed;

  const goTo = (next: StepId | null) => {
    setChosenStep(next);
    setComment('');
  };

  const evaluate = async () => {
    const ids = [...selected].filter((id) => list.some((p) => p.id === id));
    setShowProcess(true);
    setChosenStep('analysis'); // stay on the AI step while it works, even when re-evaluating from another screen
    // The whole set is sent as a plain run, so the server drops results of deleted files.
    const completed = await run(ids.length === list.length ? undefined : ids);
    if (completed) {
      showToast({ tone: 'success', title: 'La IA terminó el análisis', detail: 'Ahora verifíquelo' });
      setSelection(null);
      setOpenId(null);
      setChosenStep(null); // on to whatever now needs the person
    }
    onProjectChange(); // also after a failure: the server may have restored the project state
  };

  const decide = async (approved: boolean) => {
    if (!open || saving) return;
    setSaving(true);
    try {
      await conSesion(sendReviewApi(project.id, open.proposal_id, approved, comment.trim()));
      showToast({ tone: 'success', title: approved ? 'Marcada como SÍ' : 'Marcada como NO', detail: open.supplier ?? open.filename });
      setComment('');
      const next = pending.find((i) => i.proposal_id !== open.proposal_id);
      setOpenId(next?.proposal_id ?? null);
      setChosenStep(next ? 'verification' : null);
      reviews.recargar();
    } catch (e) {
      showToast({ tone: 'error', title: mensajeDeError(e).replace(/ \(ref\..*\)$/, '') });
    } finally {
      setSaving(false);
    }
  };

  const download = async (format: ReportFormat) => {
    try {
      const url = URL.createObjectURL(await conSesion(downloadReportApi(project.id, format)));
      const link = document.createElement('a');
      link.href = url;
      link.download = `informe-evaluacion.${format}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      showToast({ tone: 'error', title: mensajeDeError(e) });
    }
  };

  const addProposals = () => pickFiles(`${ACCEPT_PHOTOS},${ACCEPT_DOCUMENTS}`, (files) => void upload.upload(project.id, files));
  const chooseAgain = () => {
    setSelection(null); // back to the default batch: what has not been analysed yet
    goTo('analysis');
  };
  const addButton = canUpload ? <Boton etiqueta="Agregar propuestas" icono="plus" variante="secundario" onPress={addProposals} /> : null;
  const nextBatch = Math.min(unanalysed, MAX_PER_RUN);
  const evaluateOthers = canEvaluate && hasEvaluation ? (
    <Boton
      etiqueta={nextBatch > 0 ? `Analizar ${nextBatch === 1 ? 'la que falta' : `las siguientes ${nextBatch}`}` : 'Evaluar de nuevo o elegir otras'}
      icono="cpu"
      variante="secundario"
      onPress={chooseAgain}
    />
  ) : null;

  const preparing = step === 'proposals' || step === 'analysis';
  const showSteps = running; // while verifying, the steps are out of the way: the analysis is what matters
  const blocker = !canEvaluate ? (closed ? 'El proyecto está cerrado.' : 'Su rol no inicia evaluaciones.') : problem;
  const heroTitle = list.length === 0 ? 'Agregue las propuestas' : hasEvaluation ? '¿Evaluar de nuevo?' : '¿Desea evaluar este proyecto?';
  const heroDetail =
    list.length === 0
      ? 'Cargue al menos un presupuesto. Después decidirá si quiere evaluarlo.'
      : `${chosenCount === list.length ? (list.length === 1 ? 'Hay 1 propuesta lista' : `Hay ${list.length} propuestas listas`) : `Eligió ${chosenCount} de ${list.length} propuestas`}. La IA leerá cada documento, revisará cuentas y condiciones, y le explicará por qué sí o por qué no.`;

  // The preparation screen has its own large button, so only later screens use the bottom bar.
  let hint = '';
  let actions = null;
  if (step === 'verification') {
    const progress = seesResults ? `${items.length - pending.length} de ${items.length} verificadas${unanalysed > 0 ? ` · ${unanalysed} sin analizar` : ''}.` : 'La IA terminó. El comité está verificando.';
    hint = `Paso ${EVALUATION_STEPS.findIndex((s) => s.id === 'verification') + 1} de ${EVALUATION_STEPS.length} · ${progress}`;
    actions = (
      <>
        {addButton}
        {evaluateOthers}
        {pending.length === 0 && seesResults ? <Boton etiqueta="Ver la respuesta final" icono="arrow-right" onPress={() => goTo('result')} /> : null}
      </>
    );
  } else if (step === 'result') {
    hint = unanalysed > 0 ? `Quedan ${unanalysed} sin analizar: el resultado todavía no las incluye.` : 'Puede agregar propuestas o evaluar de nuevo cuando quiera.';
    actions = (
      <>
        {addButton}
        {evaluateOthers}
      </>
    );
  }

  const verifying = step === 'verification' && open !== null && seesResults;
  const wide = dispositivo === 'escritorio';
  // On a wide screen the answer sits under the document, on the left; on narrow ones it stays in the bottom bar.
  const canDecide = verifying && can(role, 'review') && !closed;

  const decisionPanel = (
    <View style={{ gap: espacio.sm, padding: espacio.lg, borderRadius: radio.xl, backgroundColor: '#FFFFFF' }}>
      <Texto variante="subtitulo" accessibilityRole="header">¿Está de acuerdo?</Texto>
      <TextInput
        value={comment}
        onChangeText={setComment}
        maxLength={500}
        multiline
        placeholder="Comentario (obligatorio si cambia la respuesta de la IA)"
        placeholderTextColor={t.textoSuave}
        accessibilityLabel="Comentario de su verificación"
        style={[{ ...texto.cuerpo, minHeight: 84, padding: espacio.md, borderRadius: radio.lg, borderWidth: 1, borderColor: t.bordeControl, color: t.texto, backgroundColor: '#FFFFFF', textAlignVertical: 'top' }, soloWeb({ outlineStyle: 'none' })]}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.sm }}>
        <Boton etiqueta="No, rechazar" icono="x" variante="secundario" deshabilitado={saving} onPress={() => void decide(false)} />
        <Boton etiqueta="Sí, aprobar" icono="check" cargando={saving} onPress={() => void decide(true)} />
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, minHeight: 0, gap: espacio.md }}>
      {showSteps ? <Stepper active="analysis" reached="analysis" onSelect={goTo} /> : null}
      {/* Top bar while verifying: where things stand, and the ways to add or analyse more. */}
      {step === 'verification' && !running ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: espacio.sm }}>
          <Texto variante="pequeno" suave style={{ flexShrink: 1 }}>
            {hint}
          </Texto>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.sm }}>{actions}</View>
        </View>
      ) : null}

      {verifying ? (
        <View style={{ flex: 1, minHeight: wide ? 0 : 620, gap: espacio.sm }}>
          {/* With several proposals, a row to move between them; the width below is for reading. */}
          {items.length > 1 ? (
            <ScrollView horizontal style={{ flexGrow: 0 }} contentContainerStyle={{ gap: espacio.sm }}>
              {items.map((i) => {
                const look = VERDICT_TONE[i.verdict];
                const mine = decisionFor(i.proposal_id);
                const current = i.proposal_id === open.proposal_id;
                return (
                  <Pressable
                    key={i.proposal_id}
                    accessibilityRole="button"
                    accessibilityLabel={`Revisar ${i.supplier ?? i.filename}`}
                    accessibilityState={{ selected: current }}
                    onPress={() => {
                      setOpenId(i.proposal_id);
                      setComment('');
                    }}
                    style={(e: PressState) => ({ width: 250, flexDirection: 'row', alignItems: 'center', gap: espacio.sm, padding: espacio.sm, borderRadius: radio.lg, borderWidth: 2, borderColor: e.focused ? t.foco : current ? t.accentStrong : 'transparent', backgroundColor: current || e.hovered ? '#FFFFFF' : 'rgba(255,255,255,0.6)' })}
                  >
                    <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: t[look.tone].fondo }}>
                      <Icono nombre={look.icon} tamano="sm" color={t[look.tone].texto} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Texto variante="etiqueta" numberOfLines={1}>
                        {i.supplier ?? i.filename}
                      </Texto>
                      <Texto variante="pequeno" suave numberOfLines={1}>
                        {mine ? `Usted: ${mine.approved ? 'aprobada' : 'no aprobada'}` : 'Falta verificar'}
                      </Texto>
                    </View>
                    {mine ? <Icono nombre="user-check" tamano="sm" /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}
          {/* The document on the left, its evaluation on the right; on narrow screens, one after the other. */}
          {wide ? (
            <View style={{ flex: 1, minHeight: 0, flexDirection: 'row', gap: espacio.md }}>
              <ScrollView key={`doc-${open.proposal_id}`} showsVerticalScrollIndicator={false} style={{ flex: 2, minWidth: 220, borderRadius: radio.xl }} contentContainerStyle={{ gap: espacio.md, paddingBottom: espacio.sm }}>
                <DocumentTile filename={open.filename} onOpen={() => setViewing(open.proposal_id)} />
                {canDecide ? decisionPanel : null}
              </ScrollView>
              <ScrollView key={`eval-${open.proposal_id}`} showsVerticalScrollIndicator={false} style={{ flex: 8, minWidth: 0, borderRadius: radio.xl }} contentContainerStyle={{ paddingBottom: espacio.sm }}>
                <Entrada>
                  <VerdictSheet item={open} decision={decisionFor(open.proposal_id)} />
                </Entrada>
              </ScrollView>
            </View>
          ) : (
            <ScrollView key={open.proposal_id} style={{ flex: 1 }} contentContainerStyle={{ gap: espacio.md, paddingBottom: espacio.sm }}>
              <VerdictSheet item={open} decision={decisionFor(open.proposal_id)} />
              <DocumentTile filename={open.filename} onOpen={() => setViewing(open.proposal_id)} />
            </ScrollView>
          )}
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: espacio.md, paddingBottom: espacio.sm }}>
          {preparing ? (
            <View style={{ gap: espacio.md }}>
              {/* Two panels of the same size: proposals on the left, the evaluation on the right. */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.md, alignItems: 'stretch' }}>
                <View style={{ flex: 1, flexBasis: 380, minWidth: 0 }}>
                  <Expediente
                    proyecto={project}
                    selection={{ selected, evaluated, onChange: setSelection }}
                    onCambio={() => { proposals.recargar(); if (seesResults) void reload(); onProjectChange(); }}
                  />
                </View>
                <View style={{ flex: 1, flexBasis: 380, minWidth: 0, gap: espacio.md }}>
                  <PreparationHero
                    title={heroTitle}
                    detail={heroDetail}
                    blocker={list.length === 0 && canEvaluate ? 'Agregue al menos una propuesta para poder evaluar.' : blocker}
                    canEvaluate={canEvaluate}
                    running={running}
                    elapsed={elapsed}
                    onEvaluate={() => void evaluate()}
                    onShowProcess={() => setShowProcess(true)}
                    onBackToResult={hasEvaluation ? () => goTo(null) : undefined}
                  >
                    <RatePanel rates={rates} error={ratesError} canRegister={can(role, 'registerRate')} onSave={saveRate} />
                  </PreparationHero>
                  {error ? <ErrorConReintento texto={error} onReintentar={() => void (seesResults ? reload() : evaluate())} /> : null}
                </View>
              </View>
              {/* The upload zone spans the full width, under both panels. */}
              {canUpload && !closed ? <ZonaDeCarga onArchivos={(files) => void upload.upload(project.id, files)} ocupado={upload.busy} compact={list.length > 0} /> : null}
            </View>
          ) : null}
          {step === 'verification' && !seesResults ? (
            <Tarjeta>
              <Texto variante="subtitulo">La IA terminó su análisis</Texto>
              <Texto suave>Los resultados los verifica una persona del comité: evaluador, aprobador o coordinador.</Texto>
            </Tarjeta>
          ) : null}
          {step === 'result' && results ? (
            <ResultStep
              evaluation={results}
              decisions={decisions}
              onDownload={(f) => void download(f)}
              onOpen={(id) => {
                setOpenId(id);
                goTo('verification');
              }}
            />
          ) : null}
          {/* The result is a page to read: its actions close it instead of covering it with a bar. */}
          {step === 'result' && !preparing ? (
            <View style={{ alignItems: 'center', gap: espacio.sm, paddingVertical: espacio.md }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: espacio.sm }}>{actions}</View>
              <Texto variante="pequeno" suave style={{ textAlign: 'center' }}>
                {hint}
              </Texto>
            </View>
          ) : null}
        </ScrollView>
      )}

      {/* Narrow screens: the answer stays in a bar. On wide ones it sits under the document. */}
      {step === 'verification' && canDecide && !wide ? (
        <View style={{ ...vidrio({ opacidad: 0.96, radio: radio.xl, elevado: true }), padding: espacio.sm + 4 }}>
          <View style={{ flexDirection: 'column', alignItems: 'stretch', gap: espacio.sm }}>
            <Texto variante="etiqueta">¿Está de acuerdo?</Texto>
            <TextInput
              value={comment}
              onChangeText={setComment}
              maxLength={500}
              placeholder="Comentario (obligatorio si cambia la respuesta de la IA)"
              placeholderTextColor={t.textoSuave}
              accessibilityLabel="Comentario de su verificación"
              style={[{ ...texto.cuerpo, minHeight: 44, paddingHorizontal: espacio.md, borderRadius: radio.pildora, borderWidth: 1, borderColor: t.bordeControl, color: t.texto, backgroundColor: '#FFFFFF' }, soloWeb({ outlineStyle: 'none' })]}
            />
            <Boton etiqueta="No, rechazar" icono="x" variante="secundario" deshabilitado={saving} onPress={() => void decide(false)} />
            <Boton etiqueta="Sí, aprobar" icono="check" cargando={saving} onPress={() => void decide(true)} />
          </View>
        </View>
      ) : null}

      <MarkdownDialog projectId={project.id} proposal={list.find((p) => p.id === viewing) ?? null} onClose={() => setViewing(null)} />
      <UploadFlow visible={upload.visible} items={upload.items} busy={upload.busy} onClose={upload.close} />
      <EvaluationProcess
        visible={showProcess}
        running={running}
        elapsed={elapsed}
        files={list.filter((p) => selected.has(p.id)).map((p) => p.archivo)}
        evaluation={evaluation}
        error={error}
        onClose={() => {
          setShowProcess(false);
          if (!running) goTo(null);
        }}
      />
    </View>
  );
}
