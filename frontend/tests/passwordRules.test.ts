import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { checkPassword, isEmail, isStrongPassword } from '../src/features/auth/passwordRules';

const failing = (password: string, email = 'maria@empresa.com') => checkPassword(password, email).filter((r) => !r.passes).map((r) => r.id);

describe('password rules', () => {
  it('accepts a password that meets every rule', () => {
    assert.equal(isStrongPassword('Segura#2026ok', 'maria@empresa.com'), true);
  });
  it('reports each missing requirement', () => {
    assert.deepEqual(failing('abc'), ['length', 'case', 'number', 'symbol']);
  });
  it('rejects a password containing the email user name, ignoring case', () => {
    assert.deepEqual(failing('Maria#2026xx'), ['personal']);
  });
  it('an empty password passes nothing', () => {
    assert.equal(failing('').length, 5);
  });
  it('validates the email shape', () => {
    assert.equal(isEmail(' a@b.co '), true);
    assert.equal(isEmail('usuario'), false);
  });
});
