import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEMO_RESULT } from '../src/features/results/simulated';
import { undeterminedCost, discardsByCode, recommendationReason, organize, verdictTone } from '../src/features/results/logic';
import type { EvaluatedProposal, Result } from '../src/features/results/types';

const base = (id: string, extra: Partial<EvaluatedProposal> = {}): EvaluatedProposal => ({
  id,
  supplier: id,
  verdict: 'valid',
  score: '80.00',
  currency: 'USD',
  criteria: null,
  cost: { total: '1000.00', steps: [] },
  findings: [],
  lines: [],
  ...extra,
});
const result = (proposals: EvaluatedProposal[], ranking: string[]): Result => ({
  id: 'e1', project_id: 'p1', delta: '3', generated: '2026-01-01T00:00:00-04:00', ranking, proposals,
});

describe('organize', () => {
  it('la recomendada es la primera válida del ranking', () => {
    const r = organize(result([base('A'), base('B')], ['B', 'A']));
    assert.equal(r.recommended?.id, 'B');
    assert.deepEqual(r.ranked.map((p) => p.id), ['B', 'A']);
  });

  it('una pendiente de revisión nunca se recomienda aunque vaya primera', () => {
    const r = organize(result([base('A', { verdict: 'pending_review', score: null }), base('B')], ['A', 'B']));
    assert.equal(r.recommended?.id, 'B');
    assert.equal(r.ranked[0].id, 'A');
  });

  it('sin válidas no hay recomendada', () => {
    const r = organize(result([base('A', { verdict: 'discarded' })], ['A']));
    assert.equal(r.recommended, null);
    assert.equal(r.discarded.length, 1);
    assert.equal(r.ranked.length, 0);
  });

  it('una propuesta ausente del ranking no se pierde: va al final', () => {
    const r = organize(result([base('A'), base('B')], ['A']));
    assert.deepEqual([...r.ranked, ...r.discarded].map((p) => p.id).sort(), ['A', 'B']);
    assert.equal(r.ranked[1].id, 'B');
  });

  it('ignora ids del ranking que no existen y no repite', () => {
    const r = organize(result([base('A')], ['X', 'A', 'A']));
    assert.deepEqual(r.ranked.map((p) => p.id), ['A']);
  });

  it('asigna posición solo a las clasificadas, empezando en 1', () => {
    const r = organize(result([base('A'), base('B'), base('C', { verdict: 'discarded' })], ['A', 'B', 'C']));
    assert.deepEqual(r.ranked.map((p) => p.position), [1, 2]);
  });
});

describe('discardsByCode', () => {
  it('agrupa por causa y conserva motivo y evidencia', () => {
    const d = base('A', {
      verdict: 'discarded',
      findings: [
        { code: 'ARITMETICA', severity: 'critical', discards: true, reason: 'm1', evidence: 'e1', origin: 'rule' },
        { code: 'LECTURA', severity: 'warning', discards: false, reason: 'no descarta', evidence: '', origin: 'rule' },
      ],
    });
    const g = discardsByCode(d);
    assert.deepEqual(g.map((h) => h.code), ['ARITMETICA']);
    assert.equal(g[0].evidence, 'e1');
  });
});

describe('undeterminedCost', () => {
  it('es verdadero si falta el total o algún paso', () => {
    assert.equal(undeterminedCost(base('A', { cost: { total: null, steps: [] } })), true);
    assert.equal(undeterminedCost(base('A', { cost: { total: '10', steps: [{ item: 'Flete', amount: null, detail: '' }] } })), true);
    assert.equal(undeterminedCost(base('A')), false);
  });
});

describe('verdictTone', () => {
  it('mapea veredicto a tono: nunca solo color', () => {
    assert.equal(verdictTone('valid'), 'success');
    assert.equal(verdictTone('discarded'), 'error');
    assert.equal(verdictTone('pending_review'), 'warning');
  });
});

describe('datos de demostración', () => {
  it('son coherentes con las reglas de la pantalla', () => {
    const r = organize(DEMO_RESULT);
    assert.ok(r.recommended, 'tiene recomendada');
    assert.ok(r.discarded.length >= 2 && r.ranked.some((p) => p.verdict === 'pending_review'));
    for (const p of r.discarded) assert.ok(discardsByCode(p).length > 0, `${p.id} descartada con causa`);
    for (const p of DEMO_RESULT.proposals) for (const l of p.lines) assert.ok(l.evidence.text, 'línea con evidencia');
  });
});

describe('recommendationReason', () => {
  const con = (a: string, b: string, ca: string, cb: string) =>
    organize(result([base('A', { score: a, cost: { total: ca, steps: [] } }), base('B', { score: b, cost: { total: cb, steps: [] } })], ['A', 'B']));

  it('si es la de mayor puntaje lo dice', () => {
    const o = con('90', '70', '900', '800');
    assert.match(recommendationReason(o, '3'), /mayor puntaje/i);
  });

  it('si ganó por costo dentro de δ lo explica, citando a la de mayor puntaje', () => {
    const o = con('80', '82', '800', '900');
    const m = recommendationReason(o, '3');
    assert.match(m, /equivalencia técnica/i);
    assert.match(m, /B/);
  });

  it('sin recomendada explica que se necesita revisión', () => {
    assert.match(recommendationReason(organize(result([], [])), '3'), /ninguna/i);
  });
});
