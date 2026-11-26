import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { ErrorApi, peticion } from '../src/core/api/cliente';

type Llamada = { url: string; init: RequestInit };
const llamadas: Llamada[] = [];
const original = globalThis.fetch;

const simular = (estado: number, cuerpo?: unknown, cabeceras: Record<string, string> = {}) => {
  llamadas.length = 0;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    llamadas.push({ url, init });
    return new Response(estado === 204 ? null : JSON.stringify(cuerpo ?? {}), { status: estado, headers: cabeceras });
  }) as typeof fetch;
};

afterEach(() => {
  globalThis.fetch = original;
});

describe('peticion', () => {
  it('devuelve el JSON y arma URL, método y cabeceras', async () => {
    simular(200, { ok: 1 });
    assert.deepEqual(await peticion('/salud'), { ok: 1 });
    assert.equal(llamadas[0].url, 'http://localhost:8000/api/v1/salud');
    assert.equal(llamadas[0].init.method, 'GET');
    const h = llamadas[0].init.headers as Record<string, string>;
    assert.equal(h['Content-Type'], 'application/json');
    assert.match(h['X-Track-Id'], /^[a-z0-9]+-[a-z0-9]{10}$/);
    assert.equal(h.Authorization, undefined);
  });

  it('envía Bearer y cuerpo JSON cuando se indican', async () => {
    simular(201, {});
    await peticion('/x', { metodo: 'POST', cuerpo: { a: 1 }, token: 'tok' });
    const h = llamadas[0].init.headers as Record<string, string>;
    assert.equal(h.Authorization, 'Bearer tok');
    assert.equal(llamadas[0].init.body, '{"a":1}');
  });

  it('sin cuerpo no envía body', async () => {
    simular(200, {});
    await peticion('/x');
    assert.equal(llamadas[0].init.body, undefined);
  });

  it('204 devuelve undefined', async () => {
    simular(204);
    assert.equal(await peticion('/sesiones/actual', { metodo: 'DELETE' }), undefined);
  });

  it('error HTTP lanza ErrorApi con código, mensaje y trackId del servidor', async () => {
    simular(401, { codigo: 'credenciales_invalidas', mensaje: 'Credenciales inválidas.' }, { 'X-Track-Id': 'srv-123' });
    await assert.rejects(peticion('/x'), (e: ErrorApi) => {
      assert.ok(e instanceof ErrorApi);
      assert.deepEqual([e.estado, e.codigo, e.message, e.trackId], [401, 'credenciales_invalidas', 'Credenciales inválidas.', 'srv-123']);
      return true;
    });
  });

  it('error sin cuerpo JSON usa valores por defecto y el trackId local', async () => {
    globalThis.fetch = (async () => new Response('<html>', { status: 502 })) as typeof fetch;
    await assert.rejects(peticion('/x'), (e: ErrorApi) => {
      assert.equal(e.estado, 502);
      assert.equal(e.codigo, 'error');
      assert.equal(e.message, 'Ocurrió un error.');
      assert.ok(e.trackId);
      return true;
    });
  });

  it('fallo de red se traduce a sin_conexion (estado 0)', async () => {
    globalThis.fetch = (async () => {
      throw new TypeError('network');
    }) as typeof fetch;
    await assert.rejects(peticion('/x'), (e: ErrorApi) => e.estado === 0 && e.codigo === 'sin_conexion' && !!e.trackId);
  });

  it('el trackId local es distinto en cada petición', async () => {
    simular(200, {});
    await peticion('/a');
    await peticion('/b');
    const id = (i: number) => (llamadas[i].init.headers as Record<string, string>)['X-Track-Id'];
    assert.notEqual(llamadas[0] && id(0), id(1));
  });

  it('2xx que no es JSON lanza respuesta_invalida en vez de devolver {}', async () => {
    globalThis.fetch = (async () => new Response('<html>index</html>', { status: 200 })) as typeof fetch;
    await assert.rejects(peticion('/proyectos'), (e: ErrorApi) => e.estado === 200 && e.codigo === 'respuesta_invalida');
  });

  it('ErrorApi conserva nombre y es Error', () => {
    const e = new ErrorApi(500, 'x', 'm');
    assert.ok(e instanceof Error);
    assert.equal(e.name, 'ErrorApi');
  });
});
