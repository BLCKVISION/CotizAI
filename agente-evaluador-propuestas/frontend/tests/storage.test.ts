import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { tokenStorage } from '../src/core/session/storage';

const { doubles, fakeStorage } = (globalThis as unknown as {
  __doubles: { doubles: { 'react-native': { Platform: { OS: string } } }; fakeStorage: Map<string, string> };
}).__doubles;

beforeEach(async () => {
  doubles['react-native'].Platform.OS = 'web';
  await tokenStorage.clear();
  fakeStorage.clear();
});

describe('tokenStorage', () => {
  it('web: guarda solo en memoria y nunca toca SecureStore ni localStorage', async () => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      setItem: () => assert.fail('no debe usar localStorage'),
    };
    await tokenStorage.save('abc');
    assert.equal(await tokenStorage.read(), 'abc');
    assert.equal(fakeStorage.size, 0);
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('web: borrar limpia el token', async () => {
    await tokenStorage.save('abc');
    await tokenStorage.clear();
    assert.equal(await tokenStorage.read(), null);
  });

  it('móvil: persiste en SecureStore, lo lee y lo borra', async () => {
    doubles['react-native'].Platform.OS = 'ios';
    await tokenStorage.save('xyz');
    assert.equal(fakeStorage.get('session_token'), 'xyz');
    assert.equal(await tokenStorage.read(), 'xyz');
    await tokenStorage.clear();
    assert.equal(fakeStorage.has('session_token'), false);
    assert.equal(await tokenStorage.read(), null);
  });
});
