import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { ErrorApi, request } from '../src/core/api/client';

type Call = { url: string; init: RequestInit };
const calls: Call[] = [];
const original = globalThis.fetch;

const simulate = (state: number, body?: unknown, headers: Record<string, string> = {}) => {
  calls.length = 0;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(state === 204 ? null : JSON.stringify(body ?? {}), { status: state, headers: headers });
  }) as typeof fetch;
};

afterEach(() => {
  globalThis.fetch = original;
});

describe('request', () => {
  it('devuelve el JSON y arma URL, método y cabeceras', async () => {
    simulate(200, { ok: 1 });
    assert.deepEqual(await request('/health'), { ok: 1 });
    assert.equal(calls[0].url, 'http://localhost:8000/api/v1/health');
    assert.equal(calls[0].init.method, 'GET');
    const h = calls[0].init.headers as Record<string, string>;
    assert.equal(h['Content-Type'], 'application/json');
    assert.match(h['X-Track-Id'], /^[a-z0-9]+-[a-z0-9]{10}$/);
    assert.equal(h.Authorization, undefined);
  });

  it('envía Bearer y cuerpo JSON cuando se indican', async () => {
    simulate(201, {});
    await request('/x', { method: 'POST', body: { a: 1 }, token: 'tok' });
    const h = calls[0].init.headers as Record<string, string>;
    assert.equal(h.Authorization, 'Bearer tok');
    assert.equal(calls[0].init.body, '{"a":1}');
  });

  it('sin cuerpo no envía body', async () => {
    simulate(200, {});
    await request('/x');
    assert.equal(calls[0].init.body, undefined);
  });

  it('204 devuelve undefined', async () => {
    simulate(204);
    assert.equal(await request('/sessions/current', { method: 'DELETE' }), undefined);
  });

  it('error HTTP lanza ErrorApi con código, mensaje y trackId del servidor', async () => {
    simulate(401, { code: 'invalid_credentials', message: 'Credenciales inválidas.' }, { 'X-Track-Id': 'srv-123' });
    await assert.rejects(request('/x'), (e: ErrorApi) => {
      assert.ok(e instanceof ErrorApi);
      assert.deepEqual([e.status, e.code, e.message, e.trackId], [401, 'invalid_credentials', 'Credenciales inválidas.', 'srv-123']);
      return true;
    });
  });

  it('error sin cuerpo JSON usa valores por defecto y el trackId local', async () => {
    globalThis.fetch = (async () => new Response('<html>', { status: 502 })) as typeof fetch;
    await assert.rejects(request('/x'), (e: ErrorApi) => {
      assert.equal(e.status, 502);
      assert.equal(e.code, 'error');
      assert.equal(e.message, 'Ocurrió un error.');
      assert.ok(e.trackId);
      return true;
    });
  });

  it('fallo de red se traduce a sin_conexion (estado 0)', async () => {
    globalThis.fetch = (async () => {
      throw new TypeError('network');
    }) as typeof fetch;
    await assert.rejects(request('/x'), (e: ErrorApi) => e.status === 0 && e.code === 'no_connection' && !!e.trackId);
  });

  it('el trackId local es distinto en cada petición', async () => {
    simulate(200, {});
    await request('/a');
    await request('/b');
    const id = (i: number) => (calls[i].init.headers as Record<string, string>)['X-Track-Id'];
    assert.notEqual(calls[0] && id(0), id(1));
  });

  it('2xx que no es JSON lanza respuesta_invalida en vez de devolver {}', async () => {
    globalThis.fetch = (async () => new Response('<html>index</html>', { status: 200 })) as typeof fetch;
    await assert.rejects(request('/projects'), (e: ErrorApi) => e.status === 200 && e.code === 'invalid_response');
  });

  it('ErrorApi conserva nombre y es Error', () => {
    const e = new ErrorApi(500, 'x', 'm');
    assert.ok(e instanceof Error);
    assert.equal(e.name, 'ErrorApi');
  });
});
