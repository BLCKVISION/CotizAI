import assert from 'node:assert/strict';
import { test } from 'node:test';

import { compareProposals } from '../src/features/flow/comparison';

const item = (id: string, verdict: string, cost: string, score = '80') => ({
  proposal_id: id, filename: `${id}.pdf`, supplier: id, verdict, score, real_cost: cost, currency: 'USD', converted_cost: null,
});
const items = [item('a', 'valida', '100.10', '90'), item('b', 'valida', '99.90'), item('c', 'descartada', '50.00')];

test('the best option is the first valid one in ranking order, with differences against it', () => {
  const result = compareProposals(items, [], 'USD');
  assert.equal(result.best?.item.proposal_id, 'a');
  assert.deepEqual(result.rows.map((r) => r.difference), [0, -0.2, -50.1]);
  assert.equal(result.pending, 3);
});

test('a rejection by the committee moves the best option to the next one', () => {
  const result = compareProposals(items, [{ proposal_id: 'a', approved: false }], 'USD');
  assert.equal(result.best?.item.proposal_id, 'b');
  assert.equal(result.rows[0].status, 'rejected');
});

test('nothing is recommended when every candidate is discarded or rejected, and other currencies are not compared', () => {
  const result = compareProposals([{ ...items[2], currency: 'VES' }], [], 'USD');
  assert.equal(result.best, null);
  assert.equal(result.rows[0].cost, null);
});
