import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { ErrorApi } from '../src/core/api/cliente';
import { aTranscripcion, transcribirImagenApi } from '../src/features/transcripcion/api';

type Llamada = { url: string; init: RequestInit };
const llamadas: Llamada[] = [];
const original = globalThis.fetch;

const simular = (estado: number, cuerpo: unknown) => {
  llamadas.length = 0;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    llamadas.push({ url, init });
    return new Response(JSON.stringify(cuerpo), { status: estado });
  }) as typeof fetch;
};

afterEach(() => {
  globalThis.fetch = original;
});

const RESPUESTA = { markdown: 'm', uncertain: ['x'], quality: 'low', notices: ['n'] };

describe('transcribirImagenApi', () => {
  it('envía el archivo en binario con Bearer y el nombre codificado en ?archivo=', async () => {
    simular(200, RESPUESTA);
    const archivo = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
    await transcribirImagenApi('a b.png', archivo)('tok');
    assert.equal(llamadas[0].url, 'http://localhost:8000/api/v1/transcriptions?archivo=a%20b.png');
    assert.equal(llamadas[0].init.method, 'POST');
    const h = llamadas[0].init.headers as Record<string, string>;
    assert.equal(h.Authorization, 'Bearer tok');
    assert.equal(h['Content-Type'], 'application/octet-stream');
    assert.equal(llamadas[0].init.body, archivo);
  });

  it('traduce la respuesta del servidor al vocabulario del frontend', async () => {
    simular(200, RESPUESTA);
    assert.deepEqual(await transcribirImagenApi('a.png', new Blob(['x']))('tok'), {
      markdown: 'm',
      inciertos: ['x'],
      calidad: 'baja',
      avisos: ['n'],
    });
  });

  it('un error del servidor llega como ErrorApi con su mensaje (code/message del backend)', async () => {
    simular(503, { code: 'service_unavailable', message: 'Transcribir imágenes requiere un modelo con visión.' });
    await assert.rejects(transcribirImagenApi('a.png', new Blob(['x']))('tok'), (e: unknown) => {
      assert.ok(e instanceof ErrorApi);
      assert.equal(e.estado, 503);
      assert.equal(e.codigo, 'service_unavailable');
      assert.match(e.message, /requiere un modelo con visión/);
      return true;
    });
  });

  it('un 200 que no es JSON no se entrega como transcripción', async () => {
    llamadas.length = 0;
    globalThis.fetch = (async () => new Response('<html>proxy</html>', { status: 200 })) as typeof fetch;
    await assert.rejects(transcribirImagenApi('a.png', new Blob(['x']))('tok'), (e: unknown) => {
      assert.ok(e instanceof ErrorApi);
      assert.equal(e.codigo, 'respuesta_invalida');
      return true;
    });
  });
});

describe('aTranscripcion', () => {
  it('traduce las tres calidades', () => {
    const q = (quality: string) => aTranscripcion({ ...RESPUESTA, quality } as never).calidad;
    assert.deepEqual([q('high'), q('medium'), q('low')], ['alta', 'media', 'baja']);
  });

  it('una calidad desconocida cae en baja (lo prudente: pedir revisión)', () => {
    assert.equal(aTranscripcion({ ...RESPUESTA, quality: 'rara' } as never).calidad, 'baja');
  });

  it('campos ausentes no rompen: listas vacías y texto vacío', () => {
    assert.deepEqual(aTranscripcion({} as never), { markdown: '', inciertos: [], calidad: 'baja', avisos: [] });
  });
});
