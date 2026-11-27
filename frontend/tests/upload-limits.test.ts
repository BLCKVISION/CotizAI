import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isTooLarge, MAX_FILE_BYTES, tooLargeMessage } from '../src/features/uploads/limits';

test('exactly 10 MB is accepted and one byte more is not', () => {
  assert.equal(MAX_FILE_BYTES, 10 * 1024 * 1024);
  assert.ok(!isTooLarge(MAX_FILE_BYTES) && isTooLarge(MAX_FILE_BYTES + 1));
});

test('the message says the real size and the limit, never a size that looks allowed', () => {
  assert.equal(tooLargeMessage(MAX_FILE_BYTES + 1), 'Pesa 10,1 MB y el máximo es 10 MB. Redúzcalo o divídalo.');
  assert.match(tooLargeMessage(24 * 1024 * 1024), /Pesa 24,0 MB/);
});
