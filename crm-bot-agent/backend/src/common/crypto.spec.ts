import { describe, expect, it } from 'vitest';
import { decrypt, encrypt, encryptedColumn } from './crypto.js';

process.env['JWT_SECRET'] = 'test-secret-for-unit-tests-0123456789';

describe('crypto', () => {
  it('cifra y descifra', () => {
    const c = encrypt('EAAB-token');
    expect(c.startsWith('enc:v1:')).toBe(true);
    expect(c).not.toContain('EAAB');
    expect(decrypt(c)).toBe('EAAB-token');
  });

  it('usa un IV distinto en cada cifrado', () => {
    expect(encrypt('x')).not.toBe(encrypt('x'));
  });

  it('detecta manipulación del texto cifrado', () => {
    const c = encrypt('secreto');
    const tampered = c.slice(0, -4) + (c.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    expect(() => decrypt(tampered)).toThrow();
  });

  it('acepta valores antiguos sin cifrar', () => {
    expect(decrypt('plano')).toBe('plano');
  });

  it('el transformer deja pasar null/undefined', () => {
    expect(encryptedColumn.to(null)).toBeNull();
    expect(encryptedColumn.from(undefined)).toBeUndefined();
    expect(encryptedColumn.from(encryptedColumn.to('abc'))).toBe('abc');
  });
});
