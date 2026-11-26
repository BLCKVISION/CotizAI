import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { almacenDeToken } from '../src/core/sesion/almacen';

const { dobles, almacenFalso } = (globalThis as unknown as {
  __dobles: { dobles: { 'react-native': { Platform: { OS: string } } }; almacenFalso: Map<string, string> };
}).__dobles;

beforeEach(async () => {
  dobles['react-native'].Platform.OS = 'web';
  await almacenDeToken.borrar();
  almacenFalso.clear();
});

describe('almacenDeToken', () => {
  it('web: guarda solo en memoria y nunca toca SecureStore ni localStorage', async () => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      setItem: () => assert.fail('no debe usar localStorage'),
    };
    await almacenDeToken.guardar('abc');
    assert.equal(await almacenDeToken.leer(), 'abc');
    assert.equal(almacenFalso.size, 0);
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('web: borrar limpia el token', async () => {
    await almacenDeToken.guardar('abc');
    await almacenDeToken.borrar();
    assert.equal(await almacenDeToken.leer(), null);
  });

  it('móvil: persiste en SecureStore, lo lee y lo borra', async () => {
    dobles['react-native'].Platform.OS = 'ios';
    await almacenDeToken.guardar('xyz');
    assert.equal(almacenFalso.get('sesion_token'), 'xyz');
    assert.equal(await almacenDeToken.leer(), 'xyz');
    await almacenDeToken.borrar();
    assert.equal(almacenFalso.has('sesion_token'), false);
    assert.equal(await almacenDeToken.leer(), null);
  });
});
