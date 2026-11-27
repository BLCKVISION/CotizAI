import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { costShare, localDate, parseRate } from '../src/features/evaluations/format';

describe('evaluation format', () => {
  it('reads rates written the Venezuelan or the plain way', () => {
    assert.equal(parseRate('926,36'), '926.36');
    assert.equal(parseRate('1.016,86'), '1016.86');
    assert.equal(parseRate(' 926.36 '), '926.36');
    for (const bad of ['', '0', '-3', 'abc', '1,2,3', '1e5']) assert.equal(parseRate(bad), null);
  });
  it('uses the local calendar day, also late at night', () => {
    assert.equal(localDate(new Date(2026, 10, 27, 23, 30)), '2026-11-27');
  });
  it('compares costs against the largest one and skips unknown amounts', () => {
    assert.equal(costShare('50', ['50', '100', null]), 0.5);
    assert.equal(costShare(null, ['100']), null);
    assert.equal(costShare('1', [null]), null);
  });
});
