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
  it('web: sobrevive a una recarga con sessionStorage y nunca toca localStorage ni SecureStore', async () => {
    const tab = new Map<string, string>();
    const globals = globalThis as { localStorage?: unknown; sessionStorage?: unknown };
    globals.localStorage = { setItem: () => assert.fail('no debe usar localStorage') };
    globals.sessionStorage = {
      getItem: (k: string) => tab.get(k) ?? null,
      setItem: (k: string, v: string) => void tab.set(k, v),
      removeItem: (k: string) => void tab.delete(k),
    };
    await almacenDeToken.guardar('abc');
    assert.equal(tab.get('sesion_token'), 'abc'); // what a reloaded page finds
    assert.equal(await almacenDeToken.leer(), 'abc');
    assert.equal(almacenFalso.size, 0);
    await almacenDeToken.borrar();
    assert.equal(tab.size, 0);
    delete globals.localStorage;
    delete globals.sessionStorage;
  });

  it('web: con el almacenamiento bloqueado sigue funcionando en memoria', async () => {
    const globals = globalThis as { sessionStorage?: unknown };
    const blocked = () => { throw new Error('blocked'); };
    globals.sessionStorage = { getItem: blocked, setItem: blocked, removeItem: blocked };
    await almacenDeToken.guardar('abc');
    assert.equal(await almacenDeToken.leer(), 'abc');
    await almacenDeToken.borrar();
    assert.equal(await almacenDeToken.leer(), null);
    delete globals.sessionStorage;
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
