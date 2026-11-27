/**
 * The guided path inside a project: proposals → AI analysis → human yes/no → final answer.
 * The content scrolls; the action bar stays at the bottom, inside the window.
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
import { Expediente } from '@/features/gestion/Expediente';
import { useProposalUpload } from '@/features/home/useProposalUpload';
import type { Proyecto } from '@/features/proyectos/api';
import { UploadFlow } from '@/features/uploads/UploadFlow';

import { AnalysisStep } from './AnalysisStep';
import { currentStep, defaultSelection, MIN_PROPOSALS, pendingVerification, selectionProblem, type StepId, STEPS } from './flow';
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
  const problem = selectionProblem([...selected].filter((id) => list.some((p) => p.id === id)).length, list.length, hasEvaluation);
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
    // The whole set is sent as a plain run, so the server drops results of deleted files.
    const completed = await run(ids.length === list.length ? undefined : ids);
    if (completed) {
      showToast({ tone: 'success', title: 'La IA terminó el análisis', detail: 'Ahora verifíquelo' });
      setSelection(null);
      setOpenId(null);
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

  const addButton = canUpload ? (
    <Boton etiqueta="Agregar propuestas" icono="plus" variante="secundario" onPress={() => pickFiles(`${ACCEPT_PHOTOS},${ACCEPT_DOCUMENTS}`, (files) => void upload.upload(project.id, files))} />
  ) : null;
  const evaluateOthers = canEvaluate && hasEvaluation ? <Boton etiqueta="Evaluar de nuevo o elegir otras" icono="cpu" variante="secundario" onPress={() => goTo('analysis')} /> : null;

  let hint = '';
  let actions = null;
  if (step === 'proposals') {
    hint = list.length < MIN_PROPOSALS ? `Faltan ${MIN_PROPOSALS - list.length} propuestas para continuar.` : `${list.length} propuestas listas.`;
    actions = (
      <>
        {addButton}
        <Boton etiqueta="Continuar al análisis" icono="arrow-right" deshabilitado={list.length < MIN_PROPOSALS} onPress={() => goTo('analysis')} />
      </>
    );
  } else if (step === 'analysis') {
    hint = !canEvaluate ? (closed ? 'El proyecto está cerrado.' : 'Su rol no inicia evaluaciones.') : (problem ?? `${selected.size} de ${list.length} elegidas.`);
    actions = (
      <>
        {addButton}
        {running ? (
          <Boton etiqueta={`Ver el proceso (${elapsed} s)`} icono="activity" onPress={() => setShowProcess(true)} />
        ) : (
          <Boton etiqueta={selected.size === list.length ? 'Evaluar todas' : `Evaluar ${selected.size} ${selected.size === 1 ? 'elegida' : 'elegidas'}`} icono="cpu" deshabilitado={!canEvaluate || problem !== null} onPress={() => void evaluate()} />
        )}
      </>
    );
  } else if (step === 'verification') {
    hint = seesResults ? `${items.length - pending.length} de ${items.length} verificadas.` : 'La IA terminó. El comité está verificando.';
    actions = (
      <>
        {addButton}
        {evaluateOthers}
        {pending.length === 0 && seesResults ? <Boton etiqueta="Ver la respuesta final" icono="arrow-right" onPress={() => goTo('result')} /> : null}
      </>
    );
  } else {
    hint = 'Puede agregar propuestas o evaluar de nuevo cuando quiera.';
    actions = (
      <>
        {addButton}
        {evaluateOthers}
      </>
    );
  }

  const verifying = step === 'verification' && open !== null && seesResults;
  const wide = dispositivo === 'escritorio';

  return (
    <View style={{ flex: 1, minHeight: 0, gap: espacio.md }}>
      <Stepper active={step} reached={reached} onSelect={goTo} />

      {verifying ? (
        <View style={{ flex: 1, minHeight: wide ? 0 : 620, flexDirection: wide ? 'row' : 'column', gap: espacio.md }}>
          <ScrollView style={{ width: wide ? 280 : undefined, flexGrow: 0, maxHeight: wide ? undefined : 180 }} contentContainerStyle={{ gap: 6 }}>
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
                  style={(e: PressState) => ({ flexDirection: 'row', alignItems: 'center', gap: espacio.sm, padding: espacio.sm + 2, borderRadius: radio.lg, borderWidth: 2, borderColor: e.focused ? t.foco : current ? t.accentStrong : 'transparent', backgroundColor: current || e.hovered ? '#FFFFFF' : 'rgba(255,255,255,0.6)' })}
                >
                  <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: t[look.tone].fondo }}>
                    <Icono nombre={look.icon} tamano="sm" color={t[look.tone].texto} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Texto variante="etiqueta" numberOfLines={1}>
                      {i.supplier ?? i.filename}
                    </Texto>
                    <Texto variante="pequeno" suave numberOfLines={1}>
                      {mine ? `Usted: ${mine.approved ? 'SÍ' : 'NO'}` : 'Falta verificar'}
                    </Texto>
                  </View>
                  {mine ? <Icono nombre="user-check" tamano="sm" /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
          <ScrollView key={open.proposal_id} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: espacio.sm }}>
            <Entrada>
              <VerdictSheet item={open} decision={decisionFor(open.proposal_id)} />
            </Entrada>
          </ScrollView>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: espacio.md, paddingBottom: espacio.sm }}>
          {step === 'proposals' ? <Expediente proyecto={project} onCambio={() => { proposals.recargar(); onProjectChange(); }} /> : null}
          {step === 'analysis' ? (
            <>
              <RatePanel rates={rates} error={ratesError} canRegister={can(role, 'registerRate')} onSave={saveRate} />
              <AnalysisStep proposals={list} selected={selected} evaluated={evaluated} onChange={setSelection} />
              {error ? <ErrorConReintento texto={error} onReintentar={() => void (seesResults ? reload() : evaluate())} /> : null}
            </>
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
        </ScrollView>
      )}

      {/* Always visible: what to do next. */}
      <View style={{ ...vidrio({ opacidad: 0.96, radio: radio.xl, elevado: true }), padding: espacio.sm + 4, gap: espacio.sm }}>
        {verifying && can(role, 'review') && !closed ? (
          <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'center' : 'stretch', gap: espacio.sm }}>
            <Texto variante="etiqueta">¿Está de acuerdo?</Texto>
            <TextInput
              value={comment}
              onChangeText={setComment}
              maxLength={500}
              placeholder="Comentario (obligatorio si cambia la respuesta de la IA)"
              placeholderTextColor={t.textoSuave}
              accessibilityLabel="Comentario de su verificación"
              style={[{ ...texto.cuerpo, flex: wide ? 1 : undefined, minHeight: 44, paddingHorizontal: espacio.md, borderRadius: radio.pildora, borderWidth: 1, borderColor: t.bordeControl, color: t.texto, backgroundColor: '#FFFFFF' }, soloWeb({ outlineStyle: 'none' })]}
            />
            <Boton etiqueta="No, rechazar" icono="x" variante="secundario" deshabilitado={saving} onPress={() => void decide(false)} />
            <Boton etiqueta="Sí, aprobar" icono="check" cargando={saving} onPress={() => void decide(true)} />
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: espacio.sm }}>
          <Texto variante="pequeno" suave style={{ flexShrink: 1 }}>
            Paso {STEPS.findIndex((s) => s.id === step) + 1} de {STEPS.length} · {hint}
          </Texto>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.sm }}>{actions}</View>
        </View>
      </View>

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
