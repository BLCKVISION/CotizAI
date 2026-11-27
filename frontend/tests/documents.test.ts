import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { documentRows } from '../src/features/flow/documents';

const files = (...ids: string[]) => ids.map((id) => ({ id }));

describe('project documents', () => {
  it('shows a file that was just uploaded, first and as not analysed', () => {
    const rows = documentRows(files('a', 'b', 'new'), ['a', 'b'], ['a']);
    assert.deepEqual(rows.map((r) => [r.proposal.id, r.status]), [['new', 'new'], ['a', 'verified'], ['b', 'to_verify']]);
  });

  it('never hides a file', () => {
    assert.equal(documentRows(files('a', 'b'), [], []).length, 2);
  });
});
