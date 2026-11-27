import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { can } from '../src/core/auth/permissions';
import { checklist, currentStep, defaultSelection, outcomes, recommendation, selectionProblem } from '../src/features/flow/flow';

const finding = (code: string, discards = true, reason = `motivo ${code}`) => ({ code, discards, reason, evidence: '', origin: 'regla' });
const item = (id: string, verdict: 'valida' | 'descartada' | 'pendiente_de_revision' = 'valida', findings = [] as ReturnType<typeof finding>[]) => ({ proposal_id: id, filename: `${id}.pdf`, supplier: null, verdict, findings });

describe('currentStep', () => {
  const base = { proposalCount: 0, hasEvaluation: false, items: [], decisions: [] };
  it('walks through the path the first time', () => {
    assert.equal(currentStep(base), 'proposals');
    assert.equal(currentStep({ ...base, proposalCount: 3 }), 'analysis');
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
  it('selects everything the first time and only the new ones afterwards', () => {
    assert.deepEqual(defaultSelection(['a', 'b'], []), ['a', 'b']);
    assert.deepEqual(defaultSelection(['a', 'b', 'c'], ['a', 'b']), ['c']);
    assert.deepEqual(defaultSelection(['a'], ['a']), ['a']);
  });
  it('explains why it cannot evaluate yet', () => {
    assert.match(selectionProblem(2, 2, false) ?? '', /al menos 3/);
    assert.match(selectionProblem(2, 5, false) ?? '', /primera evaluación/);
    assert.equal(selectionProblem(1, 5, true), null);
  });
});

describe('permissions', () => {
  it('the coordinator runs the flow but does not award', () => {
    for (const p of ['createProject', 'upload', 'evaluate', 'seeResults', 'review'] as const) assert.ok(can('coordinador', p));
    assert.equal(can('coordinador', 'award'), false);
    assert.equal(can('cargador', 'seeResults'), false);
  });
});
