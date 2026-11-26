import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import { Logger } from '@nestjs/common';
import { Client } from 'minio';

export interface StoredObject { stream: Readable; size: number }
export interface MediaStorage {
  readonly kind: 'minio' | 'disk';
  put(key: string, data: Buffer): Promise<void>;
  remove(key: string): Promise<void>;
  /** null si no existe. */
  get(key: string): Promise<StoredObject | null>;
  exists(key: string): Promise<boolean>;
}

const log = new Logger('Media');
const CACHE = 'public, max-age=31536000, immutable';

/** Carpeta de subidas para el modo disco (desarrollo y pruebas). */
export const uploadRoot = () => resolve(process.env['UPLOAD_DIR'] ?? join(process.cwd(), 'uploads'));

class DiskStorage implements MediaStorage {
  readonly kind = 'disk' as const;
  private abs(key: string) {
    const p = resolve(uploadRoot(), key);
    if (!p.startsWith(uploadRoot() + sep)) throw new Error('Clave fuera del directorio de subidas');
    return p;
  }
  async put(key: string, data: Buffer) { const p = this.abs(key); await mkdir(dirname(p), { recursive: true }); await writeFile(p, data); }
  async remove(key: string) { await rm(this.abs(key), { force: true }); }
  async exists(key: string) { return stat(this.abs(key)).then(s => s.isFile(), () => false); }
  async get(key: string) { const p = this.abs(key); const s = await stat(p).catch(() => null); return s?.isFile() ? { stream: createReadStream(p), size: s.size } : null; }
}

/** MinIO/S3: las imágenes viven en un bucket propio; el backend las sirve (el bucket no es público). */
class MinioStorage implements MediaStorage {
  readonly kind = 'minio' as const;
  private client: Client;
  constructor(private bucket: string) {
    this.client = new Client({
      endPoint: process.env['MINIO_ENDPOINT']!, port: Number(process.env['MINIO_PORT'] ?? 9000), useSSL: process.env['MINIO_USE_SSL'] === 'true',
      accessKey: process.env['MINIO_ACCESS_KEY'] ?? '', secretKey: process.env['MINIO_SECRET_KEY'] ?? '',
    });
    void this.client.bucketExists(bucket).then(
      ok => (ok ? log.log(`MinIO listo: bucket "${bucket}"`) : log.error(`MinIO: el bucket "${bucket}" no existe (ejecuta deploy/minio-setup.sh)`)),
      e => log.error(`MinIO no responde: ${(e as Error).message}`),
    );
  }
  async put(key: string, data: Buffer) { await this.client.putObject(this.bucket, key, data, data.length, { 'Content-Type': 'image/webp', 'Cache-Control': CACHE }); }
  async remove(key: string) { await this.client.removeObject(this.bucket, key).catch(() => undefined); }
  async exists(key: string) { return this.client.statObject(this.bucket, key).then(() => true, () => false); }
  async get(key: string) {
    try {
      const st = await this.client.statObject(this.bucket, key);
      return { stream: await this.client.getObject(this.bucket, key), size: st.size };
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'NoSuchKey' || code === 'NotFound') return null;
      throw e;
    }
  }
}

let impl: MediaStorage | null = null;
/** MinIO si hay MINIO_ENDPOINT; si no, disco local. */
export function storage(): MediaStorage {
  return (impl ??= process.env['MINIO_ENDPOINT'] ? new MinioStorage(process.env['MINIO_BUCKET'] ?? 'relay-media') : new DiskStorage());
}
