import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { estimateProgress, estimateSeconds, STAGES } from '../src/features/flow/progress';

describe('estimated evaluation progress', () => {
  it('grows with the number of proposals', () => {
    assert.ok(estimateSeconds(20) > estimateSeconds(3));
  });
  it('starts reading at 0 %', () => {
    assert.deepEqual(estimateProgress(0, 10), { percent: 0, stage: 0, remainingSeconds: estimateSeconds(10), overdue: false });
  });
  it('moves through the stages in order', () => {
    const total = estimateSeconds(10);
    const seen = Array.from({ length: total + 1 }, (_, t) => estimateProgress(t, 10).stage);
    assert.deepEqual([...new Set(seen)], STAGES.map((_, i) => i));
  });
  it('never claims to be finished, however long it takes', () => {
    const late = estimateProgress(10_000, 3);
    assert.equal(late.percent, 95);
    assert.equal(late.overdue, true);
    assert.equal(late.remainingSeconds, 0);
  });
  it('the stage shares add up to the whole process', () => {
    assert.ok(Math.abs(STAGES.reduce((sum, s) => sum + s.share, 0) - 1) < 1e-9);
  });
});
