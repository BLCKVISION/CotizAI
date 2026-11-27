import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { latestVerified } from '../src/features/home/verified';

const item = (id: string, extra = {}) => ({ proposal_id: id, filename: `${id}.pdf`, supplier: null, verdict: 'valida' as const, real_cost: '100', currency: 'USD', converted_cost: null, converted_currency: null, ...extra });
const projects = [{ id: 'a', nombre: 'A' }, { id: 'b', nombre: 'B' }];

describe('latestVerified', () => {
  it('puts the newest evaluation first and keeps its ranking order', () => {
    const rows = latestVerified(
      [{ project_id: 'a', evaluated_at: '2026-11-26T10:00:00Z', items: [item('old')] }, { project_id: 'b', evaluated_at: '2026-11-27T10:00:00Z', items: [item('first'), item('second')] }],
      projects,
    );
    assert.deepEqual(rows.map((r) => r.title), ['first.pdf', 'second.pdf', 'old.pdf']);
    assert.equal(rows[0].projectName, 'B');
  });
  it('prefers the supplier name and the converted cost with its own currency', () => {
    const [row] = latestVerified([{ project_id: 'a', evaluated_at: 'x', items: [item('p', { supplier: 'Proveedor', converted_cost: '3', converted_currency: 'VES' })] }], projects);
    assert.deepEqual([row.title, row.cost, row.currency], ['Proveedor', '3', 'VES']);
  });
  it('respects the limit', () => {
    assert.equal(latestVerified([{ project_id: 'a', evaluated_at: 'x', items: [item('1'), item('2'), item('3')] }], projects, 2).length, 2);
  });
});
