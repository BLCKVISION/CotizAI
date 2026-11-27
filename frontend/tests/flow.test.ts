import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { can } from '../src/core/auth/permissions';
import { checklist, currentStep, defaultSelection, EVALUATION_STEPS, finalAnswer, outcomes, recommendation, selectionProblem } from '../src/features/flow/flow';

const finding = (code: string, discards = true, reason = `motivo ${code}`) => ({ code, discards, reason, evidence: '', origin: 'regla' });
const item = (id: string, verdict: 'valida' | 'descartada' | 'pendiente_de_revision' = 'valida', findings = [] as ReturnType<typeof finding>[]) => ({ proposal_id: id, filename: `${id}.pdf`, supplier: null, verdict, findings });

describe('currentStep', () => {
  const base = { proposalCount: 0, hasEvaluation: false, items: [], decisions: [] };
  it('walks through the path the first time', () => {
    assert.equal(currentStep(base), 'proposals');
    assert.equal(currentStep({ ...base, proposalCount: 1 }), 'analysis');
  });
  it('asks for verification until every proposal has a yes or no', () => {
    const items = [item('a'), item('b')];
    assert.equal(currentStep({ ...base, hasEvaluation: true, items, decisions: [{ proposal_id: 'a', approved: true, comment: '' }] }), 'verification');
    assert.equal(currentStep({ ...base, hasEvaluation: true, items, decisions: items.map((i) => ({ proposal_id: i.proposal_id, approved: true, comment: '' })) }), 'result');
  });
});

describe('template', () => {
  it('always asks the same questions and marks what failed', () => {
    const checks = checklist(item('a', 'descartada', [finding('ARITMETICA')]));
    assert.equal(checks.length, 7);
    assert.equal(checks.find((c) => c.code === 'ARITMETICA')?.state, 'no');
    assert.equal(checks.find((c) => c.code === 'ALCANCE')?.state, 'yes');
  });
  it('never shows an unreadable proposal as passing', () => {
    assert.ok(checklist(item('a', 'pendiente_de_revision', [finding('LECTURA', false)])).every((c) => c.state === 'unchecked'));
  });
  it('explains each final answer and recommends the best approved one', () => {
    const list = outcomes([item('first', 'descartada', [finding('CALIDAD', true, 'equipos usados')]), item('second')], [
      { proposal_id: 'first', approved: false, comment: '' },
      { proposal_id: 'second', approved: true, comment: '' },
    ]);
    assert.equal(list[0].reason, 'equipos usados');
    assert.equal(recommendation(list)?.item.proposal_id, 'second');
    assert.equal(list[1].changed, false);
  });
});

describe('selection', () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);
  it('selects at most five, starting with what has not been analysed', () => {
    assert.deepEqual(defaultSelection(['a', 'b'], []), ['a', 'b']);
    assert.equal(defaultSelection(ids(12), []).length, 5);
    assert.deepEqual(defaultSelection(ids(7), ids(5)), ['p5', 'p6']);
    assert.deepEqual(defaultSelection(['a'], ['a']), ['a']);
  });
  it('allows from one to five per batch', () => {
    assert.equal(selectionProblem(1, 1), null);
    assert.equal(selectionProblem(5, 20), null);
    assert.match(selectionProblem(6, 20) ?? '', /Máximo 5/);
    assert.match(selectionProblem(0, 3) ?? '', /al menos una/);
    assert.match(selectionProblem(0, 0) ?? '', /al menos una propuesta/);
  });
});

describe('permissions', () => {
  it('the coordinator runs the flow but does not award', () => {
    for (const p of ['createProject', 'upload', 'evaluate', 'seeResults', 'review'] as const) assert.ok(can('coordinador', p));
    assert.equal(can('coordinador', 'award'), false);
    assert.equal(can('cargador', 'seeResults'), false);
  });
});

describe('final answer', () => {
  const no = (id: string, comment = '') => ({ proposal_id: id, approved: false, comment });
  const yes = (id: string, comment = '') => ({ proposal_id: id, approved: true, comment });
  const cost = () => 'USD 100,00';

  it('shows only the three evaluation steps', () => {
    assert.deepEqual(EVALUATION_STEPS.map((s) => s.id), ['analysis', 'verification', 'result']);
  });
  it('explains a single rejection in everyday words, without repeating a problem', () => {
    const findings = [finding('MANIPULACION'), finding('MANIPULACION'), finding('COMPAT'), finding('LECTURA', false)];
    const answer = finalAnswer(outcomes([item('a', 'descartada', findings)], [no('a')]), cost);
    assert.equal(answer.approved, false);
    assert.equal(answer.headline, 'Esta propuesta no cumple');
    assert.equal(answer.paragraphs[1], 'No la recomendamos porque ofrece componentes que no son compatibles entre sí y contiene instrucciones dirigidas a la inteligencia artificial para alterar la evaluación.');
  });
  it('quotes the person when they rejected what the AI accepted', () => {
    const answer = finalAnswer(outcomes([item('a')], [no('a', 'Sin referencias.')]), cost);
    assert.equal(answer.paragraphs[1], 'Motivo registrado en la verificación: «Sin referencias».');
  });
  it('names the recommended proposal with its figures', () => {
    const answer = finalAnswer(outcomes([item('a'), item('b', 'descartada', [finding('ALCANCE')])], [yes('a'), no('b')]), cost, () => 88);
    assert.equal(answer.headline, 'a.pdf');
    assert.deepEqual(answer.paragraphs, ['Se revisaron 2 propuestas: 1 quedó aprobada y 1 rechazada.', 'La opción recomendada es a.pdf, con un costo real de USD 100,00 y 88 puntos de 100.']);
  });
  it('says so when a person approved what the AI had discarded, and omits unknown figures', () => {
    const answer = finalAnswer(outcomes([item('a', 'descartada', [finding('ABUSIVO')])], [yes('a', 'Flete aclarado')]), () => null);
    assert.equal(answer.paragraphs[1], 'La opción recomendada es a.pdf.');
    assert.match(answer.paragraphs[2], /La IA no la daba por válida.*«Flete aclarado»/);
  });
});
