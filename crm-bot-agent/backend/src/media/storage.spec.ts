import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const calls: Record<string, unknown[][]> = { put: [], get: [], stat: [], remove: [] };
const store = new Map<string, Buffer>();
vi.mock('minio', () => ({
  Client: class {
    constructor(public cfg: unknown) {}
    async bucketExists() { return true; }
    async putObject(b: string, k: string, d: Buffer, size: number, meta: unknown) { calls['put']!.push([b, k, size, meta]); store.set(`${b}/${k}`, d); }
    async statObject(b: string, k: string) { calls['stat']!.push([b, k]); const d = store.get(`${b}/${k}`); if (!d) throw Object.assign(new Error('x'), { code: 'NotFound' }); return { size: d.length }; }
    async getObject(b: string, k: string) { calls['get']!.push([b, k]); return Readable.from(store.get(`${b}/${k}`)!); }
    async removeObject(b: string, k: string) { calls['remove']!.push([b, k]); store.delete(`${b}/${k}`); }
  },
}));

const read = async (s: Readable) => { const c: Buffer[] = []; for await (const x of s) c.push(x as Buffer); return Buffer.concat(c); };

describe('almacenamiento de imágenes', () => {
  beforeEach(() => { vi.resetModules(); store.clear(); Object.values(calls).forEach(a => (a.length = 0)); });
  afterEach(() => { delete process.env['MINIO_ENDPOINT']; delete process.env['MINIO_BUCKET']; delete process.env['UPLOAD_DIR']; });

  it('usa disco si no hay MINIO_ENDPOINT', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'media-'));
    process.env['UPLOAD_DIR'] = dir;
    const { storage } = await import('./storage.js');
    const s = storage();
    expect(s.kind).toBe('disk');
    await s.put('products/u/a.webp', Buffer.from('hola'));
    expect(await s.exists('products/u/a.webp')).toBe(true);
    const got = await s.get('products/u/a.webp');
    expect(got?.size).toBe(4); expect((await read(got!.stream)).toString()).toBe('hola');
    await s.remove('products/u/a.webp');
    expect(await s.get('products/u/a.webp')).toBeNull();
    await rm(dir, { recursive: true, force: true });
  });

  it('el modo disco rechaza claves que salen del directorio', async () => {
    process.env['UPLOAD_DIR'] = await mkdtemp(join(tmpdir(), 'media-'));
    const { storage } = await import('./storage.js');
    await expect(storage().put('../../etc/pwned', Buffer.from('x'))).rejects.toThrow();
  });

  it('usa MinIO si hay MINIO_ENDPOINT, con bucket y cabeceras de caché', async () => {
    process.env['MINIO_ENDPOINT'] = 'minio'; process.env['MINIO_BUCKET'] = 'relay-media';
    const { storage } = await import('./storage.js');
    const s = storage();
    expect(s.kind).toBe('minio');
    await s.put('products/u/a.webp', Buffer.from('datos'));
    const [bucket, key, size, meta] = calls['put']![0]!;
    expect([bucket, key, size]).toEqual(['relay-media', 'products/u/a.webp', 5]);
    expect(meta).toMatchObject({ 'Content-Type': 'image/webp' });
    expect((await read((await s.get('products/u/a.webp'))!.stream)).toString()).toBe('datos');
  });

  it('MinIO: un objeto inexistente devuelve null (no lanza)', async () => {
    process.env['MINIO_ENDPOINT'] = 'minio';
    const { storage } = await import('./storage.js');
    expect(await storage().get('products/u/nada.webp')).toBeNull();
    expect(await storage().exists('products/u/nada.webp')).toBe(false);
  });

  it('MinIO: remove elimina el objeto', async () => {
    process.env['MINIO_ENDPOINT'] = 'minio';
    const { storage } = await import('./storage.js');
    await storage().put('k', Buffer.from('1')); await storage().remove('k');
    expect(await storage().exists('k')).toBe(false);
  });
});

describe('product-images con MinIO', () => {
  beforeEach(() => { vi.resetModules(); store.clear(); });
  afterEach(() => { delete process.env['MINIO_ENDPOINT']; });
  it('guarda imagen y miniatura y solo sirve nombres válidos', async () => {
    process.env['MINIO_ENDPOINT'] = 'minio';
    const sharp = (await import('sharp')).default;
    const { storeProductImage, readMedia, removeProductImage } = await import('./product-images.js');
    const uid = '11111111-1111-4111-8111-111111111111';
    const png = await sharp({ create: { width: 50, height: 50, channels: 3, background: '#fff' } }).png().toBuffer();
    const url = await storeProductImage(uid, png);
    const file = url.split('/').pop()!;
    expect(store.size).toBe(2);
    expect(await readMedia(uid, file)).not.toBeNull();
    expect(await readMedia(uid, file.replace('.webp', '-thumb.webp'))).not.toBeNull();
    expect(await readMedia(uid, '../x.webp')).toBeNull();
    expect(await readMedia('no-uuid', file)).toBeNull();
    await removeProductImage(url, 'otro-usuario'); expect(store.size).toBe(2);
    await removeProductImage(url, uid); expect(store.size).toBe(0);
  });
});
